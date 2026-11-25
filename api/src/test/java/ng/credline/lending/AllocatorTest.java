package ng.credline.lending;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class AllocatorTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 4, 10);

    private final List<Allocator.Slot> slots = List.of(
            new Allocator.Slot(1, 1, LocalDate.of(2026, 3, 1), 500, 3_000, 10_000),
            new Allocator.Slot(2, 2, LocalDate.of(2026, 4, 1), 0, 2_000, 11_000),
            new Allocator.Slot(3, 3, LocalDate.of(2026, 5, 1), 0, 1_500, 12_000),
            new Allocator.Slot(4, 4, LocalDate.of(2026, 6, 1), 0, 800, 13_000));

    @Test
    void oldestInstalmentFirstFeesThenInterestThenPrincipal() {
        Allocator.Result r = Allocator.allocate(slots, 5_000, TODAY);
        assertThat(r.splits()).containsExactly(new Allocator.Split(1, 500, 3_000, 1_500));
        assertThat(r.closesLoan()).isFalse();
        assertThat(r.refund()).isZero();
    }

    @Test
    void spillsIntoTheNextInstalment() {
        Allocator.Result r = Allocator.allocate(slots, 15_000, TODAY);
        assertThat(r.splits()).containsExactly(
                new Allocator.Split(1, 500, 3_000, 10_000),
                new Allocator.Split(2, 0, 1_500, 0));
    }

    @Test
    void payoffChargesOnlyTheCurrentPeriodsInterestAndWaivesTheRest() {
        long payoff = Allocator.payoff(slots, TODAY);
        assertThat(payoff).isEqualTo(500 + 3_000 + 10_000 + 2_000 + 11_000 + 1_500 + 12_000 + 13_000);
        Allocator.Result r = Allocator.allocate(slots, payoff + 700, TODAY);
        assertThat(r.closesLoan()).isTrue();
        assertThat(r.refund()).isEqualTo(700);
        assertThat(r.waivers()).containsExactly(new Allocator.Waiver(4, 800));
        assertThat(r.principal()).isEqualTo(46_000);
    }

    @Test
    void daysPastDueCountsFromTheOldestUnpaidInstalment() {
        assertThat(Allocator.daysPastDue(slots, TODAY)).isEqualTo(40);
        assertThat(Allocator.daysPastDue(slots.subList(2, 4), TODAY)).isZero();
        assertThat(Allocator.overdue(slots, TODAY)).isEqualTo(500 + 3_000 + 10_000 + 2_000 + 11_000);
    }

    @Test
    void bucketsFollowDaysPastDue() {
        assertThat(Delinquency.of(0)).isEqualTo(Delinquency.CURRENT);
        assertThat(Delinquency.of(1)).isEqualTo(Delinquency.DPD_1_30);
        assertThat(Delinquency.of(30)).isEqualTo(Delinquency.DPD_1_30);
        assertThat(Delinquency.of(31)).isEqualTo(Delinquency.DPD_31_60);
        assertThat(Delinquency.of(90)).isEqualTo(Delinquency.DPD_61_90);
        assertThat(Delinquency.of(91)).isEqualTo(Delinquency.DPD_90_PLUS);
    }
}
