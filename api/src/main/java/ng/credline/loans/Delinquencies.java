package ng.credline.loans;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import ng.credline.common.Actor;
import ng.credline.common.AuditLog;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class Delinquencies {

    private static final String REFRESH = """
            with calc as (
              select l.id, l.bucket as old_bucket,
                     coalesce(max(:d - i.due_date) filter (where i.paid_on is null and i.due_date < :d), 0) as dpd
              from loans l left join installments i on i.loan_id = l.id
              where l.status = 'ACTIVE' and (cast(:loan as bigint) is null or l.id = :loan)
              group by l.id
            ), next as (
              select id, old_bucket, dpd,
                     case when dpd = 0 then 'CURRENT' when dpd <= 30 then 'DPD_1_30' when dpd <= 60 then 'DPD_31_60'
                          when dpd <= 90 then 'DPD_61_90' else 'DPD_90_PLUS' end as bucket
              from calc
            )
            update loans l set dpd = n.dpd, max_dpd = greatest(l.max_dpd, n.dpd), bucket = n.bucket
            from next n
            where l.id = n.id and (l.dpd <> n.dpd or l.bucket <> n.bucket)
            returning l.id, n.old_bucket, n.bucket, n.dpd
            """;

    record Change(long id, String oldBucket, String bucket, int dpd) {}

    private final JdbcClient db;
    private final LoanEvents events;
    private final AuditLog audit;

    public Delinquencies(JdbcClient db, LoanEvents events, AuditLog audit) {
        this.db = db;
        this.events = events;
        this.audit = audit;
    }

    public int refreshAll(LocalDate date) {
        return refresh(null, date);
    }

    public int refresh(Long loanId, LocalDate date) {
        List<Change> changes = db.sql(REFRESH).param("d", date).param("loan", loanId).query(Change.class).list();
        int moved = 0;
        for (Change c : changes) {
            if (!c.oldBucket().equals(c.bucket())) {
                moved++;
                events.record(c.id(), "BUCKET_CHANGED", null, date, Map.of("from", c.oldBucket(), "to", c.bucket(), "dpd", c.dpd()));
                audit.record(Actor.SYSTEM, "BUCKET_CHANGED", "loan", c.id(), Map.of("from", c.oldBucket(), "to", c.bucket(), "dpd", c.dpd()));
            }
        }
        return moved;
    }
}
