package ng.credline.console;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import ng.credline.common.Rows;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class Overview {

    private final JdbcClient db;
    private final Rows rows;

    Overview(JdbcClient db, Rows rows) {
        this.db = db;
        this.rows = rows;
    }

    Map<String, Object> build(LocalDate today) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", today);
        out.put("portfolio", rows.one(db.sql("""
                select count(*) filter (where status = 'ACTIVE') as active_loans,
                       coalesce(sum(principal - principal_paid) filter (where status = 'ACTIVE'), 0) as outstanding,
                       count(*) filter (where disbursed_on is not null) as disbursed_count,
                       coalesce(sum(principal) filter (where disbursed_on is not null), 0) as disbursed,
                       coalesce(sum(interest_paid), 0) as interest_earned,
                       coalesce(sum(fee) filter (where disbursed_on is not null), 0) as upfront_fees,
                       coalesce(sum(fees_paid), 0) as late_fees,
                       coalesce(sum(written_off_amount), 0) as written_off,
                       count(*) filter (where status = 'PAID_OFF') as paid_off,
                       count(*) filter (where status = 'WRITTEN_OFF') as written_off_count,
                       coalesce(sum(principal - principal_paid) filter (where status = 'ACTIVE' and dpd > 0), 0) as par1,
                       coalesce(sum(principal - principal_paid) filter (where status = 'ACTIVE' and dpd > 30), 0) as par30,
                       coalesce(sum(principal - principal_paid) filter (where status = 'ACTIVE' and dpd > 90), 0) as par90
                from loans
                """)).orElseThrow());
        out.put("buckets", rows.list(db.sql("""
                select b.bucket, count(l.id) as loans, coalesce(sum(l.principal - l.principal_paid), 0) as outstanding
                from unnest(array['CURRENT', 'DPD_1_30', 'DPD_31_60', 'DPD_61_90', 'DPD_90_PLUS']) with ordinality as b(bucket, ord)
                left join loans l on l.bucket = b.bucket and l.status = 'ACTIVE'
                group by b.bucket, b.ord order by b.ord
                """)));
        Timestamp since = Timestamp.valueOf(today.minusDays(30).atStartOfDay());
        out.put("funnel", rows.one(db.sql("""
                select count(*) as submitted,
                       count(*) filter (where d.outcome in ('APPROVE', 'COUNTER')) as auto_approved,
                       count(*) filter (where d.outcome = 'REFER') as referred,
                       count(*) filter (where d.outcome = 'DECLINE') as auto_declined,
                       count(*) filter (where a.status = 'ACCEPTED') as accepted,
                       count(*) filter (where a.status in ('APPROVED', 'ACCEPTED', 'EXPIRED', 'REJECTED_BY_BORROWER')) as offered,
                       coalesce(round(avg(d.score)), 0) as average_score
                from applications a join decisions d on d.application_id = a.id
                where a.created_at >= ?
                """).param(since)).orElseThrow());
        out.put("declineReasons", rows.list(db.sql("""
                select reason, count(*) as count
                from decisions d cross join lateral unnest(d.reasons) as reason
                where d.outcome = 'DECLINE'
                group by reason order by count desc, reason limit 6
                """)));
        out.put("disbursements", rows.list(db.sql("""
                select w.week::date as week, count(l.id) as loans, coalesce(sum(l.principal), 0) as amount
                from generate_series(date_trunc('week', ?::date) - interval '11 weeks', date_trunc('week', ?::date), interval '1 week') as w(week)
                left join loans l on l.disbursed_on >= w.week and l.disbursed_on < w.week + interval '1 week'
                group by w.week order by w.week
                """).params(today, today)));
        out.put("collections", rows.one(db.sql("""
                select coalesce(sum(i.principal_due + i.interest_due), 0) as due,
                       coalesce(sum(i.principal_paid + i.interest_paid + i.interest_waived), 0) as collected,
                       count(*) as installments,
                       count(*) filter (where i.paid_on is not null and i.paid_on <= i.due_date) as on_time
                from installments i join loans l on l.id = i.loan_id
                where i.due_date >= ? and i.due_date < ? and l.status <> 'DISBURSEMENT_FAILED'
                """).params(today.minusDays(30), today)).orElseThrow());
        out.put("queue", rows.one(db.sql("""
                select count(*) filter (where status = 'REFERRED') as referred,
                       count(*) filter (where status = 'PENDING_CHECKER') as pending_checker,
                       count(*) filter (where status = 'APPROVED') as open_offers
                from applications
                """)).orElseThrow());
        out.put("lastRun", rows.one(db.sql("select * from business_days order by business_date desc limit 1")).orElse(null));
        return out;
    }
}
