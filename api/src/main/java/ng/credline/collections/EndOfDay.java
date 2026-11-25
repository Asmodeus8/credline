package ng.credline.collections;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import ng.credline.CredlineProperties;
import ng.credline.common.Actor;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import ng.credline.loans.Delinquencies;
import ng.credline.loans.LoanEvents;
import ng.credline.loans.Repayments;
import ng.credline.payments.PaymentGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class EndOfDay {

    private static final Logger log = LoggerFactory.getLogger(EndOfDay.class);
    private static final DateTimeFormatter COMPACT = DateTimeFormatter.BASIC_ISO_DATE;

    public record Summary(LocalDate businessDate, String status, int debitsAttempted, int debitsSucceeded,
                          int lateFeesCharged, int bucketChanges, int offersExpired) {}

    record Due(long loanId, String authorizationCode, String cardType, String last4, int expMonth, int expYear, String bank,
               long amount, LocalDate oldestDue) {}

    record Fee(long loanId, long id, int seq, long lateFeeDue) {}

    private final JdbcClient db;
    private final TransactionTemplate tx;
    private final BusinessClock clock;
    private final PaymentGateway gateway;
    private final Repayments repayments;
    private final Delinquencies delinquencies;
    private final LoanEvents events;
    private final AuditLog audit;
    private final List<Integer> retryDays;
    private final int graceDays;

    public EndOfDay(JdbcClient db, TransactionTemplate tx, BusinessClock clock, PaymentGateway gateway, Repayments repayments,
                    Delinquencies delinquencies, LoanEvents events, AuditLog audit, CredlineProperties props) {
        this.db = db;
        this.tx = tx;
        this.clock = clock;
        this.gateway = gateway;
        this.repayments = repayments;
        this.delinquencies = delinquencies;
        this.events = events;
        this.audit = audit;
        this.retryDays = props.collections().retryDays();
        this.graceDays = props.collections().graceDays();
    }

    @Scheduled(cron = "${credline.collections.cron}", zone = "${credline.zone}")
    void scheduled() {
        Summary s = run(clock.today());
        log.info("End of day {}: {}", s.businessDate(), s);
    }

    public Summary run(LocalDate date) {
        boolean claimed = db.sql("""
                insert into business_days (business_date, status) values (?, 'RUNNING')
                on conflict (business_date) do update set status = 'RUNNING', started_at = now()
                  where business_days.status = 'RUNNING' and business_days.started_at < now() - interval '10 minutes'
                returning business_date
                """).param(date).query(LocalDate.class).optional().isPresent();
        if (!claimed) {
            return summary(date);
        }
        int[] debits = collect(date);
        int fees = chargeLateFees(date);
        int moved = delinquencies.refreshAll(date);
        int expired = expireOffers();
        db.sql("""
                update business_days set status = 'DONE', debits_attempted = ?, debits_succeeded = ?, late_fees_charged = ?,
                       bucket_changes = ?, offers_expired = ?, finished_at = now()
                where business_date = ?
                """).params(debits[0], debits[1], fees, moved, expired, date).update();
        return summary(date);
    }

    public Summary summary(LocalDate date) {
        return db.sql("""
                select business_date, status, debits_attempted, debits_succeeded, late_fees_charged, bucket_changes, offers_expired
                from business_days where business_date = ?
                """).param(date).query(Summary.class).single();
    }

    boolean shouldAttempt(long daysLate) {
        if (retryDays.contains((int) daysLate)) {
            return true;
        }
        int last = retryDays.getLast();
        return daysLate > last && daysLate % 7 == 0;
    }

    int[] collect(LocalDate date) {
        List<Due> due = db.sql("""
                select l.id as loan_id, m.authorization_code, m.card_type, m.last4, m.exp_month, m.exp_year, m.bank,
                       sum(i.late_fee_due - i.late_fee_paid + i.interest_due - i.interest_paid - i.interest_waived
                           + i.principal_due - i.principal_paid) as amount,
                       min(i.due_date) as oldest_due
                from loans l
                join mandates m on m.id = l.mandate_id and m.active
                join installments i on i.loan_id = l.id and i.paid_on is null and i.due_date <= ?
                where l.status = 'ACTIVE'
                group by l.id, m.id
                order by l.id
                """).param(date).query(Due.class).list();
        int attempted = 0;
        int succeeded = 0;
        for (Due d : due) {
            if (d.amount() <= 0 || !shouldAttempt(ChronoUnit.DAYS.between(d.oldestDue(), date))) {
                continue;
            }
            String reference = "DBT-" + d.loanId() + "-" + date.format(COMPACT);
            boolean fresh = db.sql("""
                    insert into debit_attempts (loan_id, reference, business_date, amount, status) values (?, ?, ?, ?, 'PENDING')
                    on conflict do nothing returning id
                    """).params(d.loanId(), reference, date, d.amount()).query(Long.class).optional().isPresent();
            if (!fresh) {
                continue;
            }
            attempted++;
            PaymentGateway.Card card = new PaymentGateway.Card(d.authorizationCode(), d.cardType(), d.last4(), d.expMonth(), d.expYear(), d.bank());
            PaymentGateway.Result result;
            try {
                result = gateway.charge(card, "loan" + d.loanId() + "@borrowers.credline.ng", d.amount(), reference);
            } catch (RuntimeException e) {
                log.warn("Debit {} errored", reference, e);
                result = PaymentGateway.Result.failed("Gateway error");
            }
            if (resolve(reference, result)) {
                succeeded++;
            }
        }
        return new int[] {attempted, succeeded};
    }

    public boolean resolve(String reference, PaymentGateway.Result result) {
        if (result.status() == PaymentGateway.Status.PENDING) {
            return false;
        }
        record Attempt(long loanId, long amount, String status, LocalDate businessDate) {}
        Attempt a = db.sql("select loan_id, amount, status, business_date from debit_attempts where reference = ?")
                .param(reference).query(Attempt.class).optional().orElse(null);
        if (a == null || !"PENDING".equals(a.status())) {
            return false;
        }
        if (result.status() == PaymentGateway.Status.SUCCESS) {
            repayments.apply(a.loanId(), a.amount(), reference, "CARD_DEBIT", Actor.SYSTEM);
            db.sql("update debit_attempts set status = 'SUCCESS' where reference = ? and status = 'PENDING'").param(reference).update();
            return true;
        }
        tx.executeWithoutResult(s -> {
            int updated = db.sql("update debit_attempts set status = 'FAILED', failure_reason = ? where reference = ? and status = 'PENDING'")
                    .params(result.reason(), reference).update();
            if (updated == 1) {
                events.record(a.loanId(), "DEBIT_FAILED", a.amount(), a.businessDate(), Map.of("reference", reference, "reason", String.valueOf(result.reason())));
            }
        });
        return false;
    }

    int chargeLateFees(LocalDate date) {
        return tx.execute(s -> {
            List<Fee> fees = db.sql("""
                    update installments i
                    set late_fee_due = round((i.principal_due + i.interest_due) * l.late_fee_bps / 10000.0)::bigint,
                        late_fee_charged = true
                    from loans l
                    where l.id = i.loan_id and l.status = 'ACTIVE' and i.paid_on is null and not i.late_fee_charged
                      and i.due_date + ? < ?
                    returning i.loan_id, i.id, i.seq, i.late_fee_due
                    """).params(graceDays, date).query(Fee.class).list();
            for (Fee f : fees) {
                events.record(f.loanId(), "LATE_FEE", f.lateFeeDue(), date, Map.of("installment", f.seq()));
            }
            return fees.size();
        });
    }

    int expireOffers() {
        return tx.execute(s -> {
            List<Long> ids = db.sql("""
                    update applications set status = 'EXPIRED', updated_at = ?
                    where status = 'APPROVED' and offer_expires_at < ?
                    returning id
                    """).params(Timestamp.from(clock.now()), Timestamp.from(clock.now())).query(Long.class).list();
            for (long id : ids) {
                audit.record(Actor.SYSTEM, "OFFER_EXPIRED", "application", id, Map.of());
            }
            return ids.size();
        });
    }
}
