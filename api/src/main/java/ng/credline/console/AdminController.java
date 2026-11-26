package ng.credline.console;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import ng.credline.common.Rows;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/console")
class AdminController {

    private final JdbcClient db;
    private final Rows rows;
    private final BusinessClock clock;
    private final AuditLog audit;
    private final TransactionTemplate tx;

    AdminController(JdbcClient db, Rows rows, BusinessClock clock, AuditLog audit, TransactionTemplate tx) {
        this.db = db;
        this.rows = rows;
        this.clock = clock;
        this.audit = audit;
        this.tx = tx;
    }

    record ProductChange(
            @Positive long minAmount,
            @Positive long maxAmount,
            @Min(1) @Max(36) int minTenor,
            @Min(1) @Max(36) int maxTenor,
            @Min(1) @Max(2000) int monthlyRateBps,
            @Min(0) @Max(1000) int feeBps,
            @Min(0) @Max(1000) int lateFeeBps) {}

    @GetMapping("/search")
    Map<String, Object> search(@RequestParam String q) {
        String term = q.trim();
        if (term.length() < 2) {
            return Map.of("borrowers", List.of(), "loans", List.of(), "applications", List.of());
        }
        String like = "%" + term + "%";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("borrowers", rows.list(db.sql("""
                select id, first_name || ' ' || last_name as name, phone from borrowers
                where first_name || ' ' || last_name ilike ? or phone like ? order by id desc limit 5
                """).params(like, like)));
        out.put("loans", rows.list(db.sql("""
                select l.id, l.reference, l.status, b.first_name || ' ' || b.last_name as name
                from loans l join borrowers b on b.id = l.borrower_id
                where l.reference ilike ? or b.first_name || ' ' || b.last_name ilike ? order by l.id desc limit 5
                """).params(like, like)));
        out.put("applications", rows.list(db.sql("""
                select a.id, a.reference, a.status, b.first_name || ' ' || b.last_name as name
                from applications a join borrowers b on b.id = a.borrower_id
                where a.reference ilike ? or b.first_name || ' ' || b.last_name ilike ? order by a.id desc limit 5
                """).params(like, like)));
        return out;
    }

    @GetMapping("/borrowers")
    List<Map<String, Object>> borrowers(@RequestParam(required = false) String q) {
        String like = q == null || q.isBlank() ? null : "%" + q.trim() + "%";
        return rows.list(db.sql("""
                select b.id, b.first_name || ' ' || b.last_name as name, b.phone, b.employment, b.employer, b.monthly_income, b.created_at,
                       count(l.id) as loans,
                       count(l.id) filter (where l.status = 'PAID_OFF') as paid_off,
                       coalesce(sum(l.principal - l.principal_paid) filter (where l.status = 'ACTIVE'), 0) as outstanding,
                       coalesce(max(l.max_dpd), 0) as worst_dpd,
                       coalesce(max(l.dpd) filter (where l.status = 'ACTIVE'), 0) as current_dpd,
                       coalesce(bool_or(l.status = 'WRITTEN_OFF'), false) as written_off,
                       bool_or(l.status = 'ACTIVE') as has_active,
                       (select a.status from applications a where a.borrower_id = b.id order by a.id desc limit 1) as last_application
                from borrowers b left join loans l on l.borrower_id = b.id
                where cast(:q as text) is null or b.first_name || ' ' || b.last_name ilike :q or b.phone like :q
                group by b.id order by b.id desc limit 400
                """).param("q", like));
    }

    @GetMapping("/borrowers/{id}")
    Map<String, Object> borrower(@PathVariable long id) {
        Map<String, Object> b = rows.one(db.sql("""
                select id, first_name, last_name, phone, 'xxxxxxx' || right(bvn, 4) as bvn, date_of_birth, employment, employer,
                       monthly_income, bank_code, account_number, created_at
                from borrowers where id = ?
                """).param(id)).orElseThrow(() -> ApiException.notFound("Borrower"));
        b.put("applications", rows.list(db.sql("""
                select a.id, a.reference, a.status, a.amount, a.tenor_months, a.offer_amount, a.created_at, p.name as product_name,
                       d.outcome, d.score, d.reasons
                from applications a join products p on p.code = a.product_code left join decisions d on d.application_id = a.id
                where a.borrower_id = ? order by a.id desc
                """).param(id)));
        b.put("loans", rows.list(db.sql("""
                select l.id, l.reference, l.status, l.principal, l.principal - l.principal_paid as outstanding, l.dpd, l.max_dpd, l.bucket,
                       l.tenor_months, l.disbursed_on, l.closed_on, p.name as product_name,
                       l.principal_paid + l.interest_paid + l.fees_paid as repaid
                from loans l join products p on p.code = l.product_code where l.borrower_id = ? order by l.id desc
                """).param(id)));
        b.put("cards", rows.list(db.sql("select card_type, last4, bank, exp_month, exp_year, active, created_at from mandates where borrower_id = ? order by id desc").param(id)));
        b.put("bureau", rows.one(db.sql("""
                select c.bureau, c.hit, c.score, c.active_facilities, c.delinquent_facilities, c.monthly_obligations, c.pulled_at
                from credit_reports c join applications a on a.id = c.application_id where a.borrower_id = ? order by c.id desc limit 1
                """).param(id)).orElse(null));
        b.put("activity", rows.list(db.sql("""
                select id, actor_type, actor_name, action, entity, entity_id, detail, at from audit_events
                where (actor_type = 'BORROWER' and actor_id = :id)
                   or (entity = 'borrower' and entity_id = :id)
                   or (entity = 'application' and entity_id in (select id from applications where borrower_id = :id))
                   or (entity = 'loan' and entity_id in (select id from loans where borrower_id = :id))
                order by id desc limit 60
                """).param("id", id)));
        return b;
    }

    @GetMapping("/disbursements")
    Map<String, Object> disbursements(@RequestParam(defaultValue = "ALL") String status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totals", rows.list(db.sql("select status, count(*) as count, coalesce(sum(amount), 0) as amount from disbursements group by status order by status")));
        out.put("rows", rows.list(db.sql("""
                select d.reference, d.amount, d.bank_code, d.account_number, d.status, d.failure_reason, d.created_at, d.completed_at,
                       l.id as loan_id, l.reference as loan_reference, l.principal, l.fee, p.name as product_name,
                       b.first_name || ' ' || b.last_name as borrower_name
                from disbursements d join loans l on l.id = d.loan_id join borrowers b on b.id = l.borrower_id join products p on p.code = l.product_code
                where :status = 'ALL' or d.status = :status
                order by d.id desc limit 400
                """).param("status", status)));
        return out;
    }

    @GetMapping("/repayments")
    Map<String, Object> repayments(@RequestParam(defaultValue = "ALL") String channel) {
        LocalDate today = clock.today();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totals", rows.list(db.sql("""
                select channel, count(*) as count, sum(amount) as amount, sum(to_principal) as principal, sum(to_interest) as interest,
                       sum(to_late_fees) as late_fees
                from repayments where received_on > ? group by channel order by amount desc
                """).param(today.minusDays(30))));
        out.put("daily", rows.list(db.sql("""
                select d::date as day, coalesce(sum(r.amount), 0) as amount, count(r.id) as count
                from generate_series((?::date - 29)::timestamp, ?::date::timestamp, interval '1 day') d
                left join repayments r on r.received_on = d::date
                group by d order by d
                """).params(today, today)));
        out.put("rows", rows.list(db.sql("""
                select r.id, r.reference, r.channel, r.amount, r.to_late_fees, r.to_interest, r.to_principal, r.to_refund, r.received_on,
                       s.name as recorded_by, l.id as loan_id, l.reference as loan_reference, b.first_name || ' ' || b.last_name as borrower_name
                from repayments r join loans l on l.id = r.loan_id join borrowers b on b.id = l.borrower_id left join staff s on s.id = r.recorded_by
                where :channel = 'ALL' or r.channel = :channel
                order by r.id desc limit 400
                """).param("channel", channel)));
        return out;
    }

    @GetMapping("/reports")
    Map<String, Object> reports() {
        LocalDate today = clock.today();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", today);
        out.put("vintages", rows.list(db.sql("""
                select to_char(date_trunc('month', disbursed_on), 'YYYY-MM') as cohort, count(*) as loans, sum(principal) as disbursed,
                       count(*) filter (where status = 'PAID_OFF') as paid_off,
                       count(*) filter (where max_dpd > 30) as ever30,
                       count(*) filter (where max_dpd > 90 or status = 'WRITTEN_OFF') as ever90,
                       count(*) filter (where status = 'WRITTEN_OFF') as written_off,
                       sum(principal_paid) as principal_repaid,
                       coalesce(sum(principal - principal_paid) filter (where status = 'ACTIVE'), 0) as outstanding
                from loans where disbursed_on is not null group by 1 order by 1
                """)));
        out.put("rolls", rows.list(db.sql("""
                select detail ->> 'from' as from_bucket, detail ->> 'to' as to_bucket, count(*) as count
                from loan_events where type = 'BUCKET_CHANGED' and business_date > ?
                group by 1, 2
                """).param(today.minusDays(90))));
        out.put("collections", rows.list(db.sql("""
                select w.week::date as week,
                       coalesce(sum(i.principal_due + i.interest_due), 0) as due,
                       coalesce(sum(i.principal_paid + i.interest_paid + i.interest_waived), 0) as collected,
                       count(i.id) as installments,
                       count(i.id) filter (where i.paid_on is not null and i.paid_on <= i.due_date) as on_time
                from generate_series(date_trunc('week', ?::date) - interval '11 weeks', date_trunc('week', ?::date), interval '1 week') as w(week)
                left join installments i on i.due_date >= w.week and i.due_date < w.week + interval '1 week' and i.due_date < ?
                group by w.week order by w.week
                """).params(today, today, today)));
        out.put("products", rows.list(db.sql("""
                select p.code, p.name, count(l.id) filter (where l.disbursed_on is not null) as loans,
                       coalesce(sum(l.principal) filter (where l.disbursed_on is not null), 0) as disbursed,
                       coalesce(sum(l.principal - l.principal_paid) filter (where l.status = 'ACTIVE'), 0) as outstanding,
                       coalesce(sum(l.principal - l.principal_paid) filter (where l.status = 'ACTIVE' and l.dpd > 30), 0) as par30,
                       coalesce(sum(l.interest_paid), 0) as interest
                from products p left join loans l on l.product_code = p.code group by p.code, p.name, p.min_amount order by p.min_amount
                """)));
        return out;
    }

    @GetMapping("/products")
    List<Map<String, Object>> products() {
        return rows.list(db.sql("""
                select p.*, (select count(*) from loans l where l.product_code = p.code and l.status = 'ACTIVE') as active_loans,
                       (select count(*) from applications a where a.product_code = p.code) as applications
                from products p order by p.min_amount
                """));
    }

    @PutMapping("/products/{code}")
    Map<String, Object> updateProduct(@PathVariable String code, @Valid @RequestBody ProductChange c) {
        Actor staff = Actor.current();
        if (!staff.isManager()) {
            throw ApiException.forbidden("MANAGER_ONLY", "Only a manager can change pricing");
        }
        if (c.maxAmount() < c.minAmount() || c.maxTenor() < c.minTenor()) {
            throw ApiException.invalid("RANGE", "Maximums must be at least the minimums");
        }
        return tx.execute(s -> {
            Map<String, Object> before = rows.one(db.sql("select * from products where code = ? for update").param(code))
                    .orElseThrow(() -> ApiException.notFound("Product"));
            Map<String, Object> changes = new LinkedHashMap<>();
            changes.put("code", code);
            compare(changes, "monthlyRate", before.get("monthlyRateBps"), c.monthlyRateBps(), AdminController::percent);
            compare(changes, "upfrontFee", before.get("feeBps"), c.feeBps(), AdminController::percent);
            compare(changes, "lateFee", before.get("lateFeeBps"), c.lateFeeBps(), AdminController::percent);
            compare(changes, "minAmount", before.get("minAmount"), c.minAmount(), AdminController::naira);
            compare(changes, "maxAmount", before.get("maxAmount"), c.maxAmount(), AdminController::naira);
            compare(changes, "minTenor", before.get("minTenor"), c.minTenor(), v -> v + " months");
            compare(changes, "maxTenor", before.get("maxTenor"), c.maxTenor(), v -> v + " months");
            if (changes.size() == 1) {
                return before;
            }
            db.sql("""
                    update products set min_amount = ?, max_amount = ?, min_tenor = ?, max_tenor = ?, monthly_rate_bps = ?, fee_bps = ?,
                           late_fee_bps = ?, updated_at = ? where code = ?
                    """)
                    .params(c.minAmount(), c.maxAmount(), c.minTenor(), c.maxTenor(), c.monthlyRateBps(), c.feeBps(), c.lateFeeBps(),
                            Timestamp.from(clock.now()), code)
                    .update();
            audit.record(staff, "PRODUCT_UPDATED", "product", ((Number) before.get("id")).longValue(), changes);
            return rows.one(db.sql("select * from products where code = ?").param(code)).orElseThrow();
        });
    }

    private static void compare(Map<String, Object> changes, String key, Object before, long after, java.util.function.LongFunction<String> show) {
        long old = ((Number) before).longValue();
        if (old != after) {
            changes.put(key, show.apply(old) + " → " + show.apply(after));
        }
    }

    private static String percent(long bps) {
        return String.format("%.2f%%", bps / 100.0);
    }

    private static String naira(long kobo) {
        return String.format("₦%,d", kobo / 100);
    }

    @GetMapping("/team")
    List<Map<String, Object>> team() {
        return rows.list(db.sql("""
                select s.id, s.name, s.email, s.role, s.created_at,
                       count(a.id) filter (where a.action in ('APPLICATION_APPROVED', 'APPROVAL_PROPOSED')) as approvals,
                       count(a.id) filter (where a.action = 'APPROVAL_CONFIRMED') as confirmations,
                       count(a.id) filter (where a.action = 'APPLICATION_DECLINED') as declines,
                       count(a.id) filter (where a.action = 'REPAYMENT_RECEIVED') as repayments,
                       count(a.id) filter (where a.action = 'LOAN_WRITTEN_OFF') as write_offs,
                       count(a.id) filter (where a.action = 'PRODUCT_UPDATED') as pricing_changes,
                       max(a.at) as last_active,
                       (select json_agg(x) from (select action, entity, entity_id, at from audit_events e
                         where e.actor_type = 'STAFF' and e.actor_id = s.id and e.action <> 'CLOCK_ADVANCED' order by e.id desc limit 6) x) as recent
                from staff s left join audit_events a on a.actor_type = 'STAFF' and a.actor_id = s.id
                group by s.id order by s.role desc, s.name
                """));
    }
}
