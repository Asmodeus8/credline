package ng.credline.loans;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import ng.credline.common.ApiException;
import ng.credline.common.BusinessClock;
import ng.credline.common.Rows;
import ng.credline.lending.Allocator;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class LoanViews {

    private final JdbcClient db;
    private final Rows rows;
    private final BusinessClock clock;

    public LoanViews(JdbcClient db, Rows rows, BusinessClock clock) {
        this.db = db;
        this.rows = rows;
        this.clock = clock;
    }

    public Map<String, Object> detail(long loanId, Long borrowerId) {
        Map<String, Object> loan = rows.one(db.sql("""
                select l.*, p.name as product_name, a.reference as application_reference,
                       b.first_name || ' ' || b.last_name as borrower_name, b.phone as borrower_phone,
                       m.card_type, m.last4 as card_last4, m.bank as card_bank,
                       d.reference as disbursement_reference, d.status as disbursement_status, d.bank_code, d.account_number,
                       d.failure_reason as disbursement_failure,
                       l.principal - l.principal_paid as outstanding_principal
                from loans l
                join products p on p.code = l.product_code
                join applications a on a.id = l.application_id
                join borrowers b on b.id = l.borrower_id
                left join mandates m on m.id = l.mandate_id
                left join disbursements d on d.loan_id = l.id
                where l.id = ? and (cast(? as bigint) is null or l.borrower_id = ?)
                """).params(loanId, borrowerId, borrowerId)).orElseThrow(() -> ApiException.notFound("Loan"));
        LocalDate today = clock.today();
        List<Map<String, Object>> schedule = rows.list(db.sql("""
                select id, seq, due_date, principal_due, interest_due, late_fee_due, principal_paid, interest_paid, late_fee_paid,
                       interest_waived, paid_on,
                       principal_due + interest_due + late_fee_due - principal_paid - interest_paid - late_fee_paid - interest_waived as outstanding,
                       case when paid_on is not null then 'PAID'
                            when due_date < :today then 'OVERDUE'
                            when due_date = :today then 'DUE'
                            when principal_paid + interest_paid > 0 then 'PARTIAL'
                            else 'UPCOMING' end as status
                from installments where loan_id = :loan order by seq
                """).param("today", today).param("loan", loanId));
        List<Allocator.Slot> slots = Repayments.slots(db, loanId);
        boolean open = "ACTIVE".equals(loan.get("status"));
        loan.put("today", today);
        loan.put("overdue", open ? Allocator.overdue(slots, today) : 0);
        loan.put("payoff", open ? Allocator.payoff(slots, today) : 0);
        loan.put("nextDue", slots.stream().filter(s -> !s.dueDate().isBefore(today)).findFirst()
                .map(s -> Map.of("seq", s.seq(), "dueDate", s.dueDate(), "amount", s.outstanding())).orElse(null));
        loan.put("schedule", schedule);
        loan.put("repayments", rows.list(db.sql("""
                select r.id, r.reference, r.channel, r.amount, r.to_late_fees, r.to_interest, r.to_principal, r.to_refund,
                       r.received_on, s.name as recorded_by
                from repayments r left join staff s on s.id = r.recorded_by
                where r.loan_id = ? order by r.id desc
                """).param(loanId)));
        loan.put("events", rows.list(db.sql("select id, type, amount, business_date, detail from loan_events where loan_id = ? order by id desc")
                .param(loanId)));
        loan.put("debits", rows.list(db.sql("""
                select reference, business_date, amount, status, failure_reason from debit_attempts where loan_id = ? order by business_date desc
                """).param(loanId)));
        loan.remove("mandateId");
        return loan;
    }

    public Map<String, Object> summary(Map<String, Object> detail) {
        Map<String, Object> out = new LinkedHashMap<>(detail);
        out.remove("events");
        out.remove("debits");
        return out;
    }
}
