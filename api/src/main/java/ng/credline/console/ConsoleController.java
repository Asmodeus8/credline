package ng.credline.console;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import ng.credline.common.Actor;
import ng.credline.common.BusinessClock;
import ng.credline.common.Rows;
import ng.credline.loans.LoanViews;
import ng.credline.loans.Repayments;
import ng.credline.loans.WriteOffs;
import ng.credline.origination.ApplicationViews;
import ng.credline.origination.Origination;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/console")
class ConsoleController {

    private final JdbcClient db;
    private final Rows rows;
    private final BusinessClock clock;
    private final Origination origination;
    private final ApplicationViews applications;
    private final LoanViews loans;
    private final Repayments repayments;
    private final WriteOffs writeOffs;
    private final Overview overview;

    ConsoleController(JdbcClient db, Rows rows, BusinessClock clock, Origination origination, ApplicationViews applications,
                      LoanViews loans, Repayments repayments, WriteOffs writeOffs, Overview overview) {
        this.db = db;
        this.rows = rows;
        this.clock = clock;
        this.origination = origination;
        this.applications = applications;
        this.loans = loans;
        this.repayments = repayments;
        this.writeOffs = writeOffs;
        this.overview = overview;
    }

    record Approve(@Positive Long amount, @Positive Integer tenor, @Size(max = 500) String note) {}

    record Note(@Size(max = 500) String note) {}

    record ManualRepayment(@Positive long amount, @Pattern(regexp = "^[A-Za-z0-9-]{6,64}$") String reference) {}

    @GetMapping("/overview")
    Map<String, Object> overview() {
        return overview.build(clock.today());
    }

    @GetMapping("/applications")
    List<Map<String, Object>> applications(@RequestParam(defaultValue = "QUEUE") String view) {
        String filter = switch (view) {
            case "QUEUE" -> "a.status in ('REFERRED', 'PENDING_CHECKER')";
            case "APPROVED" -> "a.status in ('APPROVED', 'ACCEPTED')";
            case "DECLINED" -> "a.status = 'DECLINED'";
            default -> "true";
        };
        return rows.list(db.sql("""
                select a.id, a.reference, a.status, a.amount, a.tenor_months, a.offer_amount, a.offer_tenor, a.purpose, a.created_at,
                       p.name as product_name, b.first_name || ' ' || b.last_name as borrower_name, b.employment, b.monthly_income,
                       d.outcome, d.score, d.reasons, mk.name as maker_name
                from applications a
                join products p on p.code = a.product_code
                join borrowers b on b.id = a.borrower_id
                join decisions d on d.application_id = a.id
                left join staff mk on mk.id = a.maker_id
                where %s
                order by a.id desc limit 200
                """.formatted(filter)));
    }

    @GetMapping("/applications/{id}")
    Map<String, Object> application(@PathVariable long id) {
        return applications.detail(id, null, true);
    }

    @PostMapping("/applications/{id}/approve")
    Map<String, Object> approve(@PathVariable long id, @Valid @RequestBody Approve body) {
        origination.approve(Actor.current(), id, body.amount(), body.tenor(), body.note());
        return applications.detail(id, null, true);
    }

    @PostMapping("/applications/{id}/confirm")
    Map<String, Object> confirm(@PathVariable long id) {
        origination.confirm(Actor.current(), id);
        return applications.detail(id, null, true);
    }

    @PostMapping("/applications/{id}/decline")
    Map<String, Object> decline(@PathVariable long id, @Valid @RequestBody Note body) {
        origination.decline(Actor.current(), id, body.note());
        return applications.detail(id, null, true);
    }

    @GetMapping("/loans")
    List<Map<String, Object>> loans(@RequestParam(defaultValue = "ACTIVE") String status, @RequestParam(required = false) String bucket,
                                    @RequestParam(required = false) String q) {
        return rows.list(db.sql("""
                select l.id, l.reference, l.status, l.principal, l.principal - l.principal_paid as outstanding, l.tenor_months,
                       l.installment_amount, l.disbursed_on, l.maturity_date, l.closed_on, l.dpd, l.bucket,
                       p.name as product_name, b.first_name || ' ' || b.last_name as borrower_name, b.phone,
                       (select min(due_date) from installments i where i.loan_id = l.id and i.paid_on is null) as next_due
                from loans l join products p on p.code = l.product_code join borrowers b on b.id = l.borrower_id
                where (:status = 'ALL' or l.status = :status)
                  and (cast(:bucket as text) is null or l.bucket = :bucket)
                  and (cast(:q as text) is null or l.reference ilike '%' || :q || '%' or b.first_name || ' ' || b.last_name ilike '%' || :q || '%' or b.phone like '%' || :q || '%')
                order by l.dpd desc, l.id desc limit 300
                """).param("status", status).param("bucket", bucket).param("q", q == null || q.isBlank() ? null : q.trim()));
    }

    @GetMapping("/loans/{id}")
    Map<String, Object> loan(@PathVariable long id) {
        Map<String, Object> loan = loans.detail(id, null);
        loan.put("audit", rows.list(db.sql("""
                select id, actor_type, actor_name, action, detail, at from audit_events
                where entity = 'loan' and entity_id = ? order by id desc
                """).param(id)));
        return loan;
    }

    @PostMapping("/loans/{id}/repayments")
    Repayments.Receipt repay(@PathVariable long id, @Valid @RequestBody ManualRepayment body) {
        return repayments.apply(id, body.amount(), "TRF-" + body.reference().toUpperCase(), "TRANSFER", Actor.current());
    }

    @PostMapping("/loans/{id}/write-off")
    ResponseEntity<Map<String, Object>> writeOff(@PathVariable long id, @Valid @RequestBody Note body) {
        writeOffs.writeOff(Actor.current(), id, body.note());
        return ResponseEntity.ok(loans.detail(id, null));
    }

    @GetMapping("/collections")
    Map<String, Object> collections(@RequestParam(required = false) LocalDate date) {
        LocalDate day = date == null ? clock.today() : date;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", day);
        out.put("day", rows.one(db.sql("select * from business_days where business_date = ?").param(day)).orElse(null));
        out.put("recentDays", rows.list(db.sql("select * from business_days order by business_date desc limit 14")));
        out.put("attempts", rows.list(db.sql("""
                select da.reference, da.amount, da.status, da.failure_reason, l.id as loan_id, l.reference as loan_reference,
                       l.dpd, b.first_name || ' ' || b.last_name as borrower_name, m.card_type, m.last4
                from debit_attempts da join loans l on l.id = da.loan_id join borrowers b on b.id = l.borrower_id
                left join mandates m on m.id = l.mandate_id
                where da.business_date = ? order by da.status, da.amount desc
                """).param(day)));
        out.put("upcoming", rows.list(db.sql("""
                select i.due_date, count(*) as installments,
                       sum(i.principal_due + i.interest_due + i.late_fee_due - i.principal_paid - i.interest_paid - i.late_fee_paid - i.interest_waived) as amount
                from installments i join loans l on l.id = i.loan_id
                where l.status = 'ACTIVE' and i.paid_on is null and i.due_date between ? and ?
                group by i.due_date order by i.due_date
                """).params(day, day.plusDays(13))));
        return out;
    }

    @GetMapping("/audit")
    List<Map<String, Object>> audit(@RequestParam(required = false) Long before, @RequestParam(required = false) String entity) {
        return rows.list(db.sql("""
                select id, actor_type, actor_name, action, entity, entity_id, detail, at from audit_events
                where (cast(:before as bigint) is null or id < :before) and (cast(:entity as text) is null or entity = :entity)
                order by id desc limit 100
                """).param("before", before).param("entity", entity));
    }
}
