package ng.credline.loans;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import ng.credline.lending.Allocator;
import ng.credline.payments.PaymentGateway;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class Repayments {

    public record Receipt(long id, String reference, String channel, long amount, long toLateFees, long toInterest,
                          long toPrincipal, long toRefund, LocalDate receivedOn, boolean loanClosed, boolean duplicate) {}

    record LoanLock(long id, long borrowerId, String status) {}

    record Stored(long id, long loanId, String reference, String channel, long amount, long toLateFees, long toInterest,
                  long toPrincipal, long toRefund, LocalDate receivedOn) {}

    private final JdbcClient db;
    private final TransactionTemplate tx;
    private final BusinessClock clock;
    private final AuditLog audit;
    private final LoanEvents events;
    private final Delinquencies delinquencies;
    private final PaymentGateway gateway;

    public Repayments(JdbcClient db, TransactionTemplate tx, BusinessClock clock, AuditLog audit, LoanEvents events,
                      Delinquencies delinquencies, PaymentGateway gateway) {
        this.db = db;
        this.tx = tx;
        this.clock = clock;
        this.audit = audit;
        this.events = events;
        this.delinquencies = delinquencies;
        this.gateway = gateway;
    }

    public static List<Allocator.Slot> slots(JdbcClient db, long loanId) {
        return db.sql("""
                select id, seq, due_date,
                       late_fee_due - late_fee_paid as late_fee,
                       interest_due - interest_paid - interest_waived as interest,
                       principal_due - principal_paid as principal
                from installments where loan_id = ? and paid_on is null order by seq
                """).param(loanId).query(Allocator.Slot.class).list();
    }

    public Receipt apply(long loanId, long amount, String reference, String channel, Actor actor) {
        if (amount <= 0) {
            throw ApiException.invalid("AMOUNT_NOT_POSITIVE", "Amount must be positive");
        }
        return tx.execute(s -> {
            LoanLock loan = db.sql("select id, borrower_id, status from loans where id = ? for update").param(loanId)
                    .query(LoanLock.class).optional().orElseThrow(() -> ApiException.notFound("Loan"));
            Optional<Receipt> existing = find(reference);
            if (existing.isPresent()) {
                Stored row = db.sql("select * from repayments where reference = ?").param(reference).query(Stored.class).single();
                if (row.loanId() != loanId) {
                    throw ApiException.conflict("REFERENCE_REUSED", "That reference belongs to another loan");
                }
                return existing.get();
            }
            if (!"ACTIVE".equals(loan.status())) {
                throw ApiException.conflict("LOAN_NOT_ACTIVE", "This loan is not taking repayments");
            }
            LocalDate today = clock.today();
            Allocator.Result r = Allocator.allocate(slots(db, loanId), amount, today);
            long repaymentId = db.sql("""
                    insert into repayments (loan_id, reference, channel, amount, to_late_fees, to_interest, to_principal, to_refund,
                                            received_on, recorded_by, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id
                    """)
                    .params(loanId, reference, channel, amount, r.lateFees(), r.interest(), r.principal(), r.refund(), today,
                            actor.type() == Actor.Type.STAFF ? actor.id() : null, Timestamp.from(clock.now()))
                    .query(Long.class).single();
            for (Allocator.Split split : r.splits()) {
                db.sql("""
                        update installments set late_fee_paid = late_fee_paid + ?, interest_paid = interest_paid + ?,
                               principal_paid = principal_paid + ?
                        where id = ?
                        """)
                        .params(split.lateFee(), split.interest(), split.principal(), split.installmentId()).update();
                db.sql("insert into allocations (repayment_id, installment_id, late_fee, interest, principal) values (?, ?, ?, ?, ?)")
                        .params(repaymentId, split.installmentId(), split.lateFee(), split.interest(), split.principal()).update();
            }
            long waived = 0;
            for (Allocator.Waiver w : r.waivers()) {
                waived += w.interest();
                db.sql("update installments set interest_waived = interest_waived + ? where id = ?").params(w.interest(), w.installmentId()).update();
            }
            db.sql("""
                    update installments set paid_on = ?
                    where loan_id = ? and paid_on is null and principal_paid = principal_due
                      and interest_paid + interest_waived = interest_due and late_fee_paid = late_fee_due
                    """).params(today, loanId).update();
            db.sql("""
                    update loans set principal_paid = principal_paid + ?, interest_paid = interest_paid + ?, fees_paid = fees_paid + ?,
                           interest_waived = interest_waived + ?,
                           status = case when ? then 'PAID_OFF' else status end,
                           closed_on = case when ? then ?::date else closed_on end,
                           dpd = case when ? then 0 else dpd end,
                           bucket = case when ? then 'CURRENT' else bucket end
                    where id = ?
                    """)
                    .params(r.principal(), r.interest(), r.lateFees(), waived, r.closesLoan(), r.closesLoan(), today,
                            r.closesLoan(), r.closesLoan(), loanId)
                    .update();
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("reference", reference);
            detail.put("channel", channel);
            detail.put("lateFees", r.lateFees());
            detail.put("interest", r.interest());
            detail.put("principal", r.principal());
            if (r.refund() > 0) {
                detail.put("refund", r.refund());
            }
            if (waived > 0) {
                detail.put("interestWaived", waived);
            }
            events.record(loanId, "REPAYMENT", amount, today, detail);
            audit.record(actor, "REPAYMENT_RECEIVED", "loan", loanId, Map.of("reference", reference, "amount", amount, "channel", channel));
            if (r.closesLoan()) {
                events.record(loanId, "PAID_OFF", null, today, Map.of());
                audit.record(Actor.SYSTEM, "LOAN_PAID_OFF", "loan", loanId, Map.of());
            } else {
                delinquencies.refresh(loanId, today);
            }
            return new Receipt(repaymentId, reference, channel, amount, r.lateFees(), r.interest(), r.principal(), r.refund(),
                    today, r.closesLoan(), false);
        });
    }

    public Receipt payWithCard(Actor borrower, long loanId, long amount, String key) {
        record Owned(long borrowerId, String status, String authorizationCode, String cardType, String last4, int expMonth, int expYear, String bank) {}
        Owned loan = db.sql("""
                select l.borrower_id, l.status, m.authorization_code, m.card_type, m.last4, m.exp_month, m.exp_year, m.bank
                from loans l join mandates m on m.id = l.mandate_id where l.id = ?
                """).param(loanId).query(Owned.class).optional()
                .filter(o -> o.borrowerId() == borrower.borrowerId())
                .orElseThrow(() -> ApiException.notFound("Loan"));
        String reference = "CRD-" + key;
        Optional<Receipt> existing = find(reference);
        if (existing.isPresent()) {
            return existing.get();
        }
        if (!"ACTIVE".equals(loan.status())) {
            throw ApiException.conflict("LOAN_NOT_ACTIVE", "This loan is not taking repayments");
        }
        long payoff = Allocator.payoff(slots(db, loanId), clock.today());
        if (amount > payoff) {
            throw ApiException.invalid("ABOVE_PAYOFF", "That's more than it takes to close the loan today");
        }
        PaymentGateway.Card card = new PaymentGateway.Card(loan.authorizationCode(), loan.cardType(), loan.last4(), loan.expMonth(), loan.expYear(), loan.bank());
        PaymentGateway.Result result = gateway.charge(card, "b" + borrower.borrowerId() + "@borrowers.credline.ng", amount, reference);
        if (result.status() == PaymentGateway.Status.FAILED) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "CARD_DECLINED", "Your card was declined: " + result.reason());
        }
        if (result.status() == PaymentGateway.Status.PENDING) {
            throw new ApiException(HttpStatus.ACCEPTED, "PAYMENT_PENDING", "Your bank is still confirming the payment");
        }
        return apply(loanId, amount, reference, "CARD", borrower);
    }

    public Optional<Receipt> find(String reference) {
        return db.sql("select * from repayments where reference = ?").param(reference).query(Stored.class).optional()
                .map(r -> new Receipt(r.id(), r.reference(), r.channel(), r.amount(), r.toLateFees(), r.toInterest(), r.toPrincipal(),
                        r.toRefund(), r.receivedOn(), false, true));
    }
}
