package ng.credline.lending;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public final class Amortization {

    private static final MathContext MC = MathContext.DECIMAL128;
    private static final BigDecimal BPS = BigDecimal.valueOf(10_000);

    private Amortization() {}

    public record Line(int seq, LocalDate dueDate, long principal, long interest, long balanceAfter) {
        public long total() {
            return principal + interest;
        }
    }

    public record Quote(
            long principal,
            long fee,
            long disbursed,
            int tenorMonths,
            int monthlyRateBps,
            long installment,
            long totalInterest,
            long totalRepayable,
            int aprBps,
            LocalDate firstDueDate,
            LocalDate maturityDate,
            List<Line> schedule) {}

    public static Quote quote(long principal, int tenorMonths, int monthlyRateBps, int feeBps, LocalDate start) {
        if (principal <= 0 || tenorMonths <= 0 || monthlyRateBps <= 0) {
            throw new IllegalArgumentException("principal, tenor and rate must be positive");
        }
        BigDecimal rate = rate(monthlyRateBps);
        long installment = installment(principal, tenorMonths, rate);
        List<Line> lines = new ArrayList<>(tenorMonths);
        long balance = principal;
        long totalInterest = 0;
        for (int seq = 1; seq <= tenorMonths; seq++) {
            long interest = BigDecimal.valueOf(balance).multiply(rate, MC).setScale(0, RoundingMode.HALF_UP).longValueExact();
            long part = seq == tenorMonths ? balance : Math.min(balance, installment - interest);
            balance -= part;
            totalInterest += interest;
            lines.add(new Line(seq, start.plusMonths(seq), part, interest, balance));
        }
        long fee = BigDecimal.valueOf(principal).multiply(BigDecimal.valueOf(feeBps)).divide(BPS, 0, RoundingMode.HALF_UP).longValueExact();
        long disbursed = principal - fee;
        List<Long> flows = lines.stream().map(Line::total).toList();
        int aprBps = (int) Math.round(monthlyIrr(disbursed, flows) * 12 * 10_000);
        return new Quote(principal, fee, disbursed, tenorMonths, monthlyRateBps, installment, totalInterest,
                principal + totalInterest, aprBps, lines.getFirst().dueDate(), lines.getLast().dueDate(), List.copyOf(lines));
    }

    public static long installment(long principal, int tenorMonths, BigDecimal rate) {
        BigDecimal growth = BigDecimal.ONE.add(rate).pow(tenorMonths, MC);
        BigDecimal factor = rate.multiply(growth, MC).divide(growth.subtract(BigDecimal.ONE), MC);
        return BigDecimal.valueOf(principal).multiply(factor, MC).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    public static long maxPrincipalFor(long payment, int tenorMonths, int monthlyRateBps, long step) {
        if (payment <= 0) {
            return 0;
        }
        BigDecimal rate = rate(monthlyRateBps);
        BigDecimal discount = BigDecimal.ONE.subtract(BigDecimal.ONE.divide(BigDecimal.ONE.add(rate).pow(tenorMonths, MC), MC));
        long raw = BigDecimal.valueOf(payment).multiply(discount, MC).divide(rate, MC).setScale(0, RoundingMode.DOWN).longValueExact();
        long rounded = raw / step * step;
        while (rounded > 0 && installment(rounded, tenorMonths, rate) > payment) {
            rounded -= step;
        }
        return Math.max(rounded, 0);
    }

    public static BigDecimal rate(int monthlyRateBps) {
        return BigDecimal.valueOf(monthlyRateBps).divide(BPS, MC);
    }

    static double monthlyIrr(long outflow, List<Long> inflows) {
        double lo = 0;
        double hi = 1;
        for (int i = 0; i < 200; i++) {
            double mid = (lo + hi) / 2;
            double pv = 0;
            for (int k = 0; k < inflows.size(); k++) {
                pv += inflows.get(k) / Math.pow(1 + mid, k + 1);
            }
            if (pv > outflow) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return (lo + hi) / 2;
    }
}
