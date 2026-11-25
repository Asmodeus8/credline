package ng.credline.lending;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

public final class Allocator {

    private Allocator() {}

    public record Slot(long id, int seq, LocalDate dueDate, long lateFee, long interest, long principal) {
        public long outstanding() {
            return lateFee + interest + principal;
        }
    }

    public record Split(long installmentId, long lateFee, long interest, long principal) {
        public long total() {
            return lateFee + interest + principal;
        }
    }

    public record Waiver(long installmentId, long interest) {}

    public record Result(List<Split> splits, List<Waiver> waivers, long refund, boolean closesLoan) {
        public long lateFees() {
            return splits.stream().mapToLong(Split::lateFee).sum();
        }

        public long interest() {
            return splits.stream().mapToLong(Split::interest).sum();
        }

        public long principal() {
            return splits.stream().mapToLong(Split::principal).sum();
        }
    }

    public static long overdue(List<Slot> slots, LocalDate today) {
        return slots.stream().filter(s -> !s.dueDate().isAfter(today)).mapToLong(Slot::outstanding).sum();
    }

    public static long payoff(List<Slot> slots, LocalDate today) {
        long total = 0;
        boolean currentSeen = false;
        for (Slot s : slots) {
            boolean accrued = !s.dueDate().isAfter(today) || !currentSeen;
            if (s.dueDate().isAfter(today)) {
                currentSeen = true;
            }
            total += s.lateFee() + s.principal() + (accrued ? s.interest() : 0);
        }
        return total;
    }

    public static int daysPastDue(List<Slot> slots, LocalDate today) {
        return slots.stream()
                .filter(s -> s.outstanding() > 0 && s.dueDate().isBefore(today))
                .map(Slot::dueDate)
                .min(LocalDate::compareTo)
                .map(d -> (int) ChronoUnit.DAYS.between(d, today))
                .orElse(0);
    }

    public static Result allocate(List<Slot> slots, long amount, LocalDate today) {
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive");
        }
        long payoff = payoff(slots, today);
        List<Split> splits = new ArrayList<>();
        List<Waiver> waivers = new ArrayList<>();
        if (amount >= payoff) {
            boolean currentSeen = false;
            for (Slot s : slots) {
                boolean accrued = !s.dueDate().isAfter(today) || !currentSeen;
                if (s.dueDate().isAfter(today)) {
                    currentSeen = true;
                }
                long interest = accrued ? s.interest() : 0;
                if (s.lateFee() + interest + s.principal() > 0) {
                    splits.add(new Split(s.id(), s.lateFee(), interest, s.principal()));
                }
                if (!accrued && s.interest() > 0) {
                    waivers.add(new Waiver(s.id(), s.interest()));
                }
            }
            return new Result(splits, waivers, amount - payoff, true);
        }
        long left = amount;
        for (Slot s : slots) {
            if (left == 0) {
                break;
            }
            long fee = Math.min(left, s.lateFee());
            left -= fee;
            long interest = Math.min(left, s.interest());
            left -= interest;
            long principal = Math.min(left, s.principal());
            left -= principal;
            if (fee + interest + principal > 0) {
                splits.add(new Split(s.id(), fee, interest, principal));
            }
        }
        return new Result(splits, waivers, left, false);
    }
}
