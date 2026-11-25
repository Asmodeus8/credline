package ng.credline.credit;

import static org.assertj.core.api.Assertions.assertThat;

import ng.credline.credit.DecisionEngine.Applicant;
import ng.credline.credit.DecisionEngine.BureauReport;
import ng.credline.credit.DecisionEngine.Employment;
import ng.credline.credit.DecisionEngine.History;
import ng.credline.credit.DecisionEngine.Outcome;
import ng.credline.credit.DecisionEngine.Product;
import ng.credline.credit.DecisionEngine.Request;
import org.junit.jupiter.api.Test;

class DecisionEngineTest {

    private final DecisionEngine engine = new DecisionEngine(20_000_000);
    private final Product salary = new Product(2_000_000, 150_000_000, 12, 350);
    private final Applicant salaried = new Applicant(32, 33, Employment.SALARIED, 40_000_000);
    private final BureauReport clean = new BureauReport(true, 735, 1, 0, 1_000_000);
    private final History firstLoan = new History(0, 0, false);

    @Test
    void approvesAStrongFirstTimeApplicantAsRequested() {
        var d = engine.decide(salaried, clean, firstLoan, salary, new Request(15_000_000, 3));
        assertThat(d.outcome()).isEqualTo(Outcome.APPROVE);
        assertThat(d.offerAmount()).isEqualTo(15_000_000);
        assertThat(d.score()).isGreaterThanOrEqualTo(DecisionEngine.APPROVE_AT);
        assertThat(d.rules()).allMatch(DecisionEngine.Rule::passed);
    }

    @Test
    void capsFirstLoansAndSaysWhy() {
        var d = engine.decide(salaried, clean, firstLoan, salary, new Request(80_000_000, 6));
        assertThat(d.outcome()).isEqualTo(Outcome.COUNTER);
        assertThat(d.offerAmount()).isEqualTo(20_000_000);
        assertThat(d.reasons()).contains("FIRST_LOAN_LIMIT");
    }

    @Test
    void countersDownToWhatTheIncomeCanCarry() {
        Applicant modest = new Applicant(30, 31, Employment.SALARIED, 8_000_000);
        var d = engine.decide(modest, clean, new History(3, 0, false), salary, new Request(15_000_000, 3));
        assertThat(d.outcome()).isIn(Outcome.COUNTER, Outcome.REFER);
        assertThat(d.reasons()).contains("AFFORDABILITY");
        assertThat(d.affordability().installment()).isLessThanOrEqualTo(d.affordability().maxInstallment());
        assertThat(d.offerAmount()).isLessThan(15_000_000);
    }

    @Test
    void declinesWithEveryFailedRule() {
        Applicant young = new Applicant(19, 20, Employment.UNEMPLOYED, 1_000_000);
        var d = engine.decide(young, new BureauReport(true, 480, 3, 2, 0), new History(1, 45, true), salary, new Request(5_000_000, 2));
        assertThat(d.outcome()).isEqualTo(Outcome.DECLINE);
        assertThat(d.reasons()).contains("AGE_OUT_OF_POLICY", "INCOME_BELOW_MINIMUM", "NO_VERIFIABLE_INCOME", "BUREAU_DELINQUENCY", "PRIOR_WRITE_OFF");
        assertThat(d.offerAmount()).isNull();
    }

    @Test
    void middlingScoresGoToAnOfficer() {
        Applicant trader = new Applicant(40, 41, Employment.SELF_EMPLOYED, 20_000_000);
        var d = engine.decide(trader, new BureauReport(true, 555, 2, 0, 2_000_000), firstLoan, salary, new Request(15_000_000, 6));
        assertThat(d.score()).isBetween(DecisionEngine.REFER_AT, DecisionEngine.APPROVE_AT - 1);
        assertThat(d.outcome()).isEqualTo(Outcome.REFER);
        assertThat(d.reasons()).contains("SCORE_IN_REVIEW_BAND");
    }

    @Test
    void thinFilesAboveTheAutoLimitAreReferred() {
        var d = engine.decide(salaried, new BureauReport(false, null, 0, 0, 0), new History(2, 0, false), salary, new Request(15_000_000, 6));
        assertThat(d.outcome()).isEqualTo(Outcome.REFER);
        assertThat(d.reasons()).contains("THIN_FILE");
    }

    @Test
    void goodHistoryWithUsRaisesTheScore() {
        var first = engine.decide(salaried, clean, firstLoan, salary, new Request(10_000_000, 3));
        var repeat = engine.decide(salaried, clean, new History(3, 2, false), salary, new Request(10_000_000, 3));
        var late = engine.decide(salaried, clean, new History(3, 40, false), salary, new Request(10_000_000, 3));
        assertThat(repeat.score()).isGreaterThan(first.score());
        assertThat(late.score()).isLessThan(first.score());
    }
}
