package ng.credline.origination;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import ng.credline.auth.Sessions;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import ng.credline.common.BusinessClock;
import ng.credline.common.Rows;
import ng.credline.lending.Amortization;
import ng.credline.loans.LoanViews;
import ng.credline.loans.Repayments;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class BorrowerController {

    private final Origination origination;
    private final ApplicationViews applications;
    private final LoanViews loans;
    private final Repayments repayments;
    private final Sessions sessions;
    private final JdbcClient db;
    private final Rows rows;
    private final BusinessClock clock;

    BorrowerController(Origination origination, ApplicationViews applications, LoanViews loans, Repayments repayments,
                       Sessions sessions, JdbcClient db, Rows rows, BusinessClock clock) {
        this.origination = origination;
        this.applications = applications;
        this.loans = loans;
        this.repayments = repayments;
        this.sessions = sessions;
        this.db = db;
        this.rows = rows;
        this.clock = clock;
    }

    record QuoteRequest(@NotBlank String product, @Positive long amount, @Min(1) @Max(36) int tenor) {}

    record Pay(@Positive long amount, @Pattern(regexp = "^[A-Za-z0-9-]{8,64}$") String idempotencyKey) {}

    @GetMapping("/products")
    List<Map<String, Object>> products() {
        return rows.list(db.sql("select * from products order by min_amount"));
    }

    @PostMapping("/quote")
    Amortization.Quote quote(@Valid @RequestBody QuoteRequest r) {
        Origination.ProductRow p = db.sql("select * from products where code = ?").param(r.product()).query(Origination.ProductRow.class)
                .optional().orElseThrow(() -> ApiException.invalid("UNKNOWN_PRODUCT", "Unknown product"));
        if (r.amount() < p.minAmount() || r.amount() > p.maxAmount() || r.tenor() < p.minTenor() || r.tenor() > p.maxTenor()) {
            throw ApiException.invalid("OUT_OF_RANGE", "Amount or tenor outside the product's limits");
        }
        return Amortization.quote(r.amount(), r.tenor(), p.monthlyRateBps(), p.feeBps(), clock.today());
    }

    @PostMapping("/applications")
    ResponseEntity<Map<String, Object>> apply(@Valid @RequestBody Origination.NewApplication body) {
        Origination.Applied applied = origination.apply(body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .headers(sessions.cookie(sessions.issue(applied.borrower())))
                .body(applications.detail(applied.applicationId(), applied.borrower().borrowerId(), false));
    }

    @GetMapping("/me")
    Map<String, Object> me() {
        Actor me = Actor.current();
        long id = me.borrowerId();
        Map<String, Object> out = new LinkedHashMap<>(rows.one(db.sql("""
                select id, first_name, last_name, phone, employment, employer, monthly_income, bank_code, account_number, created_at
                from borrowers where id = ?
                """).param(id)).orElseThrow(() -> ApiException.notFound("Borrower")));
        out.put("today", clock.today());
        out.put("applications", rows.list(db.sql("""
                select a.id, a.reference, a.status, a.amount, a.tenor_months, a.offer_amount, a.offer_tenor, a.offer_expires_at,
                       a.created_at, p.name as product_name, l.id as loan_id
                from applications a join products p on p.code = a.product_code left join loans l on l.application_id = a.id
                where a.borrower_id = ? order by a.id desc
                """).param(id)));
        out.put("loans", rows.list(db.sql("""
                select l.id, l.reference, l.status, l.principal, l.principal_paid, l.tenor_months, l.installment_amount,
                       l.disbursed_on, l.maturity_date, l.closed_on, l.dpd, p.name as product_name
                from loans l join products p on p.code = l.product_code
                where l.borrower_id = ? order by l.id desc
                """).param(id)));
        out.put("card", rows.one(db.sql("""
                select card_type, last4, bank, exp_month, exp_year from mandates where borrower_id = ? and active order by id desc limit 1
                """).param(id)).orElse(null));
        return out;
    }

    @PostMapping("/me/applications")
    ResponseEntity<Map<String, Object>> reapply(@Valid @RequestBody Origination.LoanRequest body) {
        Actor me = Actor.current();
        long appId = origination.submit(me, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(applications.detail(appId, me.borrowerId(), false));
    }

    @GetMapping("/me/applications/{id}")
    Map<String, Object> application(@PathVariable long id) {
        Map<String, Object> app = applications.detail(id, Actor.current().borrowerId(), false);
        if (app.get("offerAmount") instanceof Number amount && app.get("offerTenor") instanceof Number tenor) {
            int rate = ((Number) app.get("monthlyRateBps")).intValue();
            int fee = ((Number) app.get("feeBps")).intValue();
            app.put("offer", Amortization.quote(amount.longValue(), tenor.intValue(), rate, fee, clock.today()));
        }
        return app;
    }

    @PostMapping("/me/applications/{id}/accept")
    Origination.Acceptance accept(@PathVariable long id) {
        return origination.accept(Actor.current(), id);
    }

    @PostMapping("/me/applications/{id}/reject")
    ResponseEntity<Void> reject(@PathVariable long id) {
        origination.rejectOffer(Actor.current(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me/loans/{id}")
    Map<String, Object> loan(@PathVariable long id) {
        return loans.summary(loans.detail(id, Actor.current().borrowerId()));
    }

    @PostMapping("/me/loans/{id}/repayments")
    Repayments.Receipt pay(@PathVariable long id, @Valid @RequestBody Pay body) {
        return repayments.payWithCard(Actor.current(), id, body.amount(), body.idempotencyKey());
    }
}
