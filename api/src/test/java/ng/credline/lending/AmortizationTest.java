package ng.credline.lending;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class AmortizationTest {

    private static final LocalDate START = LocalDate.of(2026, 1, 31);

    @Test
    void equalInstalmentsOnAReducingBalance() {
        Amortization.Quote q = Amortization.quote(10_000_000, 6, 350, 0, START);
        assertThat(q.installment()).isEqualTo(1_876_682L);
        assertThat(q.schedule()).hasSize(6);
        assertThat(q.schedule().subList(0, 5)).allSatisfy(l -> assertThat(l.total()).isEqualTo(q.installment()));
        assertThat(q.schedule().getFirst().interest()).isEqualTo(350_000);
        assertThat(q.schedule().getLast().balanceAfter()).isZero();
    }

    @ParameterizedTest
    @CsvSource({"2000000,1,350", "10000000,6,350", "150000000,12,350", "300000000,12,400", "1234567,3,600", "99999999,7,415"})
    void principalAlwaysSumsToTheLoanAndInterestFallsEachMonth(long principal, int tenor, int rate) {
        Amortization.Quote q = Amortization.quote(principal, tenor, rate, 100, START);
        assertThat(q.schedule().stream().mapToLong(Amortization.Line::principal).sum()).isEqualTo(principal);
        assertThat(q.schedule().stream().mapToLong(Amortization.Line::interest).sum()).isEqualTo(q.totalInterest());
        assertThat(q.totalRepayable()).isEqualTo(principal + q.totalInterest());
        for (int i = 1; i < q.schedule().size(); i++) {
            assertThat(q.schedule().get(i).interest()).isLessThanOrEqualTo(q.schedule().get(i - 1).interest());
        }
        assertThat(Math.abs(q.schedule().getLast().total() - q.installment())).isLessThanOrEqualTo(tenor);
    }

    @Test
    void dueDatesStayOnTheMonthEndWithoutDrifting() {
        Amortization.Quote q = Amortization.quote(10_000_000, 4, 350, 0, START);
        assertThat(q.schedule()).extracting(Amortization.Line::dueDate).containsExactly(
                LocalDate.of(2026, 2, 28), LocalDate.of(2026, 3, 31), LocalDate.of(2026, 4, 30), LocalDate.of(2026, 5, 31));
    }

    @Test
    void aprIsTwelveTimesTheMonthlyRateWithoutFeesAndHigherWithThem() {
        assertThat(Amortization.quote(10_000_000, 6, 350, 0, START).aprBps()).isBetween(4_199, 4_201);
        Amortization.Quote withFee = Amortization.quote(10_000_000, 6, 350, 100, START);
        assertThat(withFee.fee()).isEqualTo(100_000);
        assertThat(withFee.disbursed()).isEqualTo(9_900_000);
        assertThat(withFee.aprBps()).isGreaterThan(4_400);
    }

    @Test
    void maxPrincipalNeverExceedsThePaymentCapacity() {
        long payment = 5_000_000;
        long max = Amortization.maxPrincipalFor(payment, 6, 350, 500_000);
        assertThat(max % 500_000).isZero();
        assertThat(Amortization.installment(max, 6, Amortization.rate(350))).isLessThanOrEqualTo(payment);
        assertThat(Amortization.installment(max + 500_000, 6, Amortization.rate(350))).isGreaterThan(payment);
    }
}
