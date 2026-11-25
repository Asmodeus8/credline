package ng.credline.loans;

import java.time.LocalDate;
import java.util.Map;
import ng.credline.common.AuditLog;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class LoanEvents {

    private final JdbcClient db;
    private final AuditLog audit;

    public LoanEvents(JdbcClient db, AuditLog audit) {
        this.db = db;
        this.audit = audit;
    }

    public void record(long loanId, String type, Long amount, LocalDate businessDate, Map<String, ?> detail) {
        db.sql("insert into loan_events (loan_id, type, amount, business_date, detail) values (?, ?, ?, ?, ?::jsonb)")
                .params(loanId, type, amount, businessDate, audit.json(detail))
                .update();
    }
}
