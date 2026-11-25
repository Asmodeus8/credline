package ng.credline.loans;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.Map;
import ng.credline.common.Actor;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import ng.credline.lending.Amortization;
import ng.credline.payments.PaymentGateway;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class Disbursements {

    record Pending(long loanId, String reference, long amount, String bankCode, String accountNumber, String name) {}

    record LoanTerms(long id, long principal, int tenorMonths, int monthlyRateBps, String status) {}

    private final JdbcClient db;
    private final TransactionTemplate tx;
    private final PaymentGateway gateway;
    private final BusinessClock clock;
    private final AuditLog audit;
    private final LoanEvents events;

    public Disbursements(JdbcClient db, TransactionTemplate tx, PaymentGateway gateway, BusinessClock clock, AuditLog audit, LoanEvents events) {
        this.db = db;
        this.tx = tx;
        this.gateway = gateway;
        this.clock = clock;
        this.audit = audit;
        this.events = events;
    }

    public void dispatch(long loanId) {
        Pending p = db.sql("""
                select d.loan_id, d.reference, d.amount, d.bank_code, d.account_number, b.first_name || ' ' || b.last_name as name
                from disbursements d join loans l on l.id = d.loan_id join borrowers b on b.id = l.borrower_id
                where d.loan_id = ? and d.status = 'PENDING'
                """).param(loanId).query(Pending.class).optional().orElse(null);
        if (p == null) {
            return;
        }
        PaymentGateway.Result result = gateway.transfer(p.reference(), p.amount(), p.bankCode(), p.accountNumber(), p.name());
        switch (result.status()) {
            case SUCCESS -> complete(p.reference(), true, null);
            case FAILED -> complete(p.reference(), false, result.reason());
            case PENDING -> { }
        }
    }

    public boolean complete(String reference, boolean success, String reason) {
        return Boolean.TRUE.equals(tx.execute(s -> {
            record Row(long loanId, String status) {}
            Row d = db.sql("select loan_id, status from disbursements where reference = ? for update").param(reference).query(Row.class).optional().orElse(null);
            if (d == null || !"PENDING".equals(d.status())) {
                return false;
            }
            LoanTerms loan = db.sql("select id, principal, tenor_months, monthly_rate_bps, status from loans where id = ? for update")
                    .param(d.loanId()).query(LoanTerms.class).single();
            LocalDate today = clock.today();
            Timestamp now = Timestamp.from(clock.now());
            if (!success) {
                db.sql("update disbursements set status = 'FAILED', failure_reason = ?, completed_at = ? where reference = ?")
                        .params(reason, now, reference).update();
                db.sql("update loans set status = 'DISBURSEMENT_FAILED' where id = ?").param(loan.id()).update();
                events.record(loan.id(), "DISBURSEMENT_FAILED", null, today, Map.of("reason", reason == null ? "unknown" : reason));
                audit.record(Actor.SYSTEM, "DISBURSEMENT_FAILED", "loan", loan.id(), Map.of("reference", reference));
                return true;
            }
            Amortization.Quote q = Amortization.quote(loan.principal(), loan.tenorMonths(), loan.monthlyRateBps(), 0, today);
            for (Amortization.Line line : q.schedule()) {
                db.sql("insert into installments (loan_id, seq, due_date, principal_due, interest_due) values (?, ?, ?, ?, ?)")
                        .params(loan.id(), line.seq(), line.dueDate(), line.principal(), line.interest())
                        .update();
            }
            db.sql("update disbursements set status = 'SUCCESS', completed_at = ? where reference = ?").params(now, reference).update();
            db.sql("""
                    update loans set status = 'ACTIVE', disbursed_on = ?, maturity_date = ?, installment_amount = ?, total_interest = ?
                    where id = ?
                    """)
                    .params(today, q.maturityDate(), q.installment(), q.totalInterest(), loan.id())
                    .update();
            long amount = db.sql("select amount from disbursements where reference = ?").param(reference).query(Long.class).single();
            events.record(loan.id(), "DISBURSED", amount, today, Map.of("reference", reference));
            audit.record(Actor.SYSTEM, "LOAN_DISBURSED", "loan", loan.id(), Map.of("reference", reference, "amount", amount));
            return true;
        }));
    }
}
