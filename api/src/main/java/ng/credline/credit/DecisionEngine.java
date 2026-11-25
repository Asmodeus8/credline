package ng.credline.credit;

import java.util.ArrayList;
import java.util.List;
import ng.credline.lending.Amortization;

public final class DecisionEngine {

    public static final String POLICY_VERSION = "2026.11";
    public static final int APPROVE_AT = 600;
    public static final int REFER_AT = 520;
    public static final int MAX_DTI_BPS = 4_000;
    public static final long MIN_INCOME = 3_000_000;
    public static final long THIN_FILE_AUTO_LIMIT = 10_000_000;
    private static final long STEP = 500_000;

    public enum Employment { SALARIED, CIVIL_SERVANT, SELF_EMPLOYED, UNEMPLOYED }

    public enum Outcome { APPROVE, COUNTER, REFER, DECLINE }

    public record Applicant(int age, int ageAtMaturity, Employment employment, long monthlyIncome) {}

    public record BureauReport(boolean hit, Integer score, int activeFacilities, int delinquentFacilities, long monthlyObligations) {}

    public record History(int closedLoans, int worstDpd, boolean writtenOff) {}

    public record Product(long minAmount, long maxAmount, int maxTenor, int monthlyRateBps) {}

    public record Request(long amount, int tenor) {}

    public record Factor(String name, String value, int points) {}

    public record Rule(String code, boolean passed, String detail) {}

    public record Affordability(long income, long obligations, long maxInstallment, long installment, int dtiBps) {}

    public record Decision(
            Outcome outcome,
            int score,
            List<String> reasons,
            Long offerAmount,
            Integer offerTenor,
            List<Rule> rules,
            List<Factor> factors,
            Affordability affordability) {}

    private final long firstLoanCap;

    public DecisionEngine(long firstLoanCap) {
        this.firstLoanCap = firstLoanCap;
    }

    public Decision decide(Applicant a, BureauReport b, History h, Product p, Request r) {
        List<Rule> rules = new ArrayList<>();
        List<String> reasons = new ArrayList<>();
        rule(rules, reasons, "AGE_OUT_OF_POLICY", a.age() >= 21 && a.ageAtMaturity() <= 60,
                "age " + a.age() + ", " + a.ageAtMaturity() + " at maturity, policy 21 to 60");
        rule(rules, reasons, "INCOME_BELOW_MINIMUM", a.monthlyIncome() >= MIN_INCOME,
                "monthly income " + naira(a.monthlyIncome()) + ", minimum " + naira(MIN_INCOME));
        rule(rules, reasons, "NO_VERIFIABLE_INCOME", a.employment() != Employment.UNEMPLOYED,
                "employment " + a.employment().name().toLowerCase().replace('_', ' '));
        rule(rules, reasons, "BUREAU_DELINQUENCY", b.delinquentFacilities() == 0,
                b.delinquentFacilities() + " delinquent facilities at the bureau");
        rule(rules, reasons, "PRIOR_WRITE_OFF", !h.writtenOff(), h.writtenOff() ? "a previous loan was written off" : "no write-offs with us");

        long maxInstallment = Math.max(0, a.monthlyIncome() * MAX_DTI_BPS / 10_000 - b.monthlyObligations());
        long amount = Math.min(r.amount(), p.maxAmount());
        int tenor = Math.min(r.tenor(), p.maxTenor());
        List<String> adjustments = new ArrayList<>();
        if (h.closedLoans() == 0 && amount > firstLoanCap) {
            amount = firstLoanCap;
            adjustments.add("FIRST_LOAN_LIMIT");
        }
        long installment = installment(amount, tenor, p);
        boolean affordable = true;
        if (installment > maxInstallment) {
            long fit = Amortization.maxPrincipalFor(maxInstallment, tenor, p.monthlyRateBps(), STEP);
            if (fit < p.minAmount() && tenor < p.maxTenor()) {
                tenor = p.maxTenor();
                fit = Math.min(amount, Amortization.maxPrincipalFor(maxInstallment, tenor, p.monthlyRateBps(), STEP));
            }
            if (fit >= p.minAmount()) {
                amount = Math.min(amount, fit);
                adjustments.add("AFFORDABILITY");
            } else {
                affordable = false;
            }
            installment = installment(amount, tenor, p);
        }
        rule(rules, reasons, "UNAFFORDABLE", affordable,
                "repayment capacity " + naira(maxInstallment) + " a month after " + naira(b.monthlyObligations()) + " existing obligations");
        int dtiBps = a.monthlyIncome() == 0 ? 10_000 : (int) ((installment + b.monthlyObligations()) * 10_000 / a.monthlyIncome());
        Affordability afford = new Affordability(a.monthlyIncome(), b.monthlyObligations(), maxInstallment, installment, dtiBps);

        List<Factor> factors = factors(a, b, h, dtiBps);
        int score = 300 + factors.stream().mapToInt(Factor::points).sum();

        if (!reasons.isEmpty()) {
            return new Decision(Outcome.DECLINE, score, List.copyOf(reasons), null, null, rules, factors, afford);
        }
        if (score < REFER_AT) {
            return new Decision(Outcome.DECLINE, score, List.of("SCORE_BELOW_CUTOFF"), null, null, rules, factors, afford);
        }
        List<String> notes = new ArrayList<>(adjustments);
        boolean refer = score < APPROVE_AT;
        if (refer) {
            notes.add("SCORE_IN_REVIEW_BAND");
        }
        if (!b.hit() && amount > THIN_FILE_AUTO_LIMIT) {
            refer = true;
            notes.add("THIN_FILE");
        }
        if (refer) {
            return new Decision(Outcome.REFER, score, List.copyOf(notes), amount, tenor, rules, factors, afford);
        }
        Outcome outcome = adjustments.isEmpty() && amount == r.amount() && tenor == r.tenor() ? Outcome.APPROVE : Outcome.COUNTER;
        return new Decision(outcome, score, List.copyOf(notes), amount, tenor, rules, factors, afford);
    }

    static List<Factor> factors(Applicant a, BureauReport b, History h, int dtiBps) {
        List<Factor> f = new ArrayList<>();
        if (!b.hit()) {
            f.add(new Factor("Bureau score", "no record", 60));
        } else {
            int s = b.score();
            int pts = s >= 720 ? 160 : s >= 650 ? 120 : s >= 580 ? 80 : s >= 500 ? 40 : 0;
            f.add(new Factor("Bureau score", String.valueOf(s), pts));
        }
        f.add(new Factor("Employment", a.employment().name().toLowerCase().replace('_', ' '), switch (a.employment()) {
            case CIVIL_SERVANT -> 90;
            case SALARIED -> 80;
            case SELF_EMPLOYED -> 50;
            case UNEMPLOYED -> 0;
        }));
        long inc = a.monthlyIncome();
        f.add(new Factor("Monthly income", naira(inc),
                inc >= 50_000_000 ? 110 : inc >= 25_000_000 ? 90 : inc >= 10_000_000 ? 60 : 30));
        f.add(new Factor("Debt to income", String.format("%.1f%%", dtiBps / 100.0),
                dtiBps <= 2_000 ? 100 : dtiBps <= 3_000 ? 70 : dtiBps <= MAX_DTI_BPS ? 30 : 0));
        int historyPts = h.closedLoans() == 0 ? 20 : h.worstDpd() > 30 ? 0 : h.worstDpd() > 7 ? 30 : Math.min(60 + 10 * (h.closedLoans() - 1), 90);
        String historyValue = h.closedLoans() == 0 ? "first loan" : h.closedLoans() + " repaid, worst " + h.worstDpd() + " days late";
        f.add(new Factor("History with us", historyValue, historyPts));
        if (b.hit() && b.activeFacilities() >= 4) {
            f.add(new Factor("Open facilities", String.valueOf(b.activeFacilities()), -40));
        }
        return f;
    }

    private static long installment(long amount, int tenor, Product p) {
        return Amortization.installment(amount, tenor, Amortization.rate(p.monthlyRateBps()));
    }

    private static void rule(List<Rule> rules, List<String> reasons, String code, boolean passed, String detail) {
        rules.add(new Rule(code, passed, detail));
        if (!passed) {
            reasons.add(code);
        }
    }

    static String naira(long kobo) {
        return String.format("₦%,d", kobo / 100);
    }
}
