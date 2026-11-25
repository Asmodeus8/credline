package ng.credline.loans;

import java.util.Map;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class WriteOffs {

    public static final int MIN_DPD = 91;

    private final JdbcClient db;
    private final TransactionTemplate tx;
    private final BusinessClock clock;
    private final AuditLog audit;
    private final LoanEvents events;

    public WriteOffs(JdbcClient db, TransactionTemplate tx, BusinessClock clock, AuditLog audit, LoanEvents events) {
        this.db = db;
        this.tx = tx;
        this.clock = clock;
        this.audit = audit;
        this.events = events;
    }

    public long writeOff(Actor staff, long loanId, String note) {
        if (!staff.isManager()) {
            throw ApiException.forbidden("MANAGER_ONLY", "Only a manager can write off a loan");
        }
        return tx.execute(s -> {
            record Row(String status, int dpd, long outstanding) {}
            Row loan = db.sql("select status, dpd, principal - principal_paid as outstanding from loans where id = ? for update")
                    .param(loanId).query(Row.class).optional().orElseThrow(() -> ApiException.notFound("Loan"));
            if (!"ACTIVE".equals(loan.status())) {
                throw ApiException.conflict("LOAN_NOT_ACTIVE", "Only active loans can be written off");
            }
            if (loan.dpd() < MIN_DPD) {
                throw ApiException.conflict("NOT_ELIGIBLE", "Loans are written off only after " + MIN_DPD + " days past due");
            }
            db.sql("update loans set status = 'WRITTEN_OFF', written_off_amount = ?, closed_on = ? where id = ?")
                    .params(loan.outstanding(), clock.today(), loanId).update();
            events.record(loanId, "WRITTEN_OFF", loan.outstanding(), clock.today(), note == null || note.isBlank() ? Map.of() : Map.of("note", note.trim()));
            audit.record(staff, "LOAN_WRITTEN_OFF", "loan", loanId, Map.of("amount", loan.outstanding(), "dpd", loan.dpd()));
            return loan.outstanding();
        });
    }
}
