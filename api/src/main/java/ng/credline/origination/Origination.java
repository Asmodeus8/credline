package ng.credline.origination;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import ng.credline.CredlineProperties;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import ng.credline.common.References;
import ng.credline.credit.CreditBureau;
import ng.credline.credit.DecisionEngine;
import ng.credline.credit.DecisionEngine.Employment;
import ng.credline.lending.Amortization;
import ng.credline.loans.Disbursements;
import ng.credline.payments.PaymentGateway;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class Origination {

    public static final long AUTHORIZATION_CHARGE = 5_000;

    public record NewBorrower(
            @NotBlank @Size(max = 60) String firstName,
            @NotBlank @Size(max = 60) String lastName,
            @Pattern(regexp = "^0[789][01][0-9]{8}$", message = "must be an 11-digit Nigerian mobile number") String phone,
            @Pattern(regexp = "^[0-9]{11}$", message = "must be 11 digits") String bvn,
            @NotNull @Past LocalDate dateOfBirth,
            @NotNull Employment employment,
            @Size(max = 80) String employer,
            @PositiveOrZero long monthlyIncome,
            @Pattern(regexp = "^[0-9]{3,6}$") String bankCode,
            @Pattern(regexp = "^[0-9]{10}$", message = "must be 10 digits") String accountNumber,
            @Pattern(regexp = "^[0-9]{4}$", message = "must be 4 digits") String pin) {}

    public record LoanRequest(
            @NotBlank String product,
            @Positive long amount,
            @Min(1) int tenor,
            @NotBlank @Size(max = 80) String purpose) {}

    public record NewApplication(@Valid @NotNull NewBorrower borrower, @Valid @NotNull LoanRequest loan) {}

    public record Acceptance(String status, String checkoutUrl, Long loanId) {}

    record ProductRow(String code, String name, long minAmount, long maxAmount, int minTenor, int maxTenor, int monthlyRateBps, int feeBps, int lateFeeBps) {}

    record BorrowerRow(long id, String firstName, String lastName, String phone, String bvn, LocalDate dateOfBirth, String employment, long monthlyIncome) {}

    record HistoryRow(int closedLoans, int worstDpd, boolean writtenOff, int openLoans) {}

    record AppRow(long id, String reference, long borrowerId, String productCode, long amount, int tenorMonths, String status,
                  Long offerAmount, Integer offerTenor, Timestamp offerExpiresAt, Long makerId) {}

    private final JdbcClient db;
    private final CreditBureau bureau;
    private final BusinessClock clock;
    private final AuditLog audit;
    private final CredlineProperties props;
    private final PasswordEncoder passwords;
    private final TransactionTemplate tx;
    private final PaymentGateway gateway;
    private final Disbursements disbursements;
    private final DecisionEngine engine;

    public Origination(JdbcClient db, CreditBureau bureau, BusinessClock clock, AuditLog audit, CredlineProperties props,
                       PasswordEncoder passwords, TransactionTemplate tx, PaymentGateway gateway, Disbursements disbursements) {
        this.db = db;
        this.bureau = bureau;
        this.clock = clock;
        this.audit = audit;
        this.props = props;
        this.passwords = passwords;
        this.tx = tx;
        this.gateway = gateway;
        this.disbursements = disbursements;
        this.engine = new DecisionEngine(props.policy().firstLoanCap());
    }

    public record Applied(Actor borrower, long applicationId) {}

    public Applied apply(NewApplication body) {
        return tx.execute(s -> {
            Actor borrower = register(body.borrower());
            return new Applied(borrower, submit(borrower, body.loan()));
        });
    }

    public Actor register(NewBorrower b) {
        try {
            long id = db.sql("""
                    insert into borrowers (phone, pin_hash, first_name, last_name, bvn, date_of_birth, employment, employer,
                                           monthly_income, bank_code, account_number)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id
                    """)
                    .params(b.phone(), passwords.encode(b.pin()), b.firstName().trim(), b.lastName().trim(), b.bvn(), b.dateOfBirth(),
                            b.employment().name(), blankToNull(b.employer()), b.monthlyIncome(), b.bankCode(), b.accountNumber())
                    .query(Long.class).single();
            Actor actor = new Actor(Actor.Type.BORROWER, id, b.firstName().trim() + " " + b.lastName().trim(), "BORROWER");
            audit.record(actor, "BORROWER_REGISTERED", "borrower", id, Map.of("phone", mask(b.phone())));
            return actor;
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("ALREADY_REGISTERED", "This phone number or BVN already has an account. Sign in to apply.");
        }
    }

    public long submit(Actor borrower, LoanRequest r) {
        return tx.execute(status -> {
            ProductRow p = db.sql("select * from products where code = ?").param(r.product()).query(ProductRow.class).optional()
                    .orElseThrow(() -> ApiException.invalid("UNKNOWN_PRODUCT", "Unknown product " + r.product()));
            if (r.amount() < p.minAmount() || r.amount() > p.maxAmount()) {
                throw ApiException.invalid("AMOUNT_OUT_OF_RANGE", "Amount must be between the product's limits");
            }
            if (r.tenor() < p.minTenor() || r.tenor() > p.maxTenor()) {
                throw ApiException.invalid("TENOR_OUT_OF_RANGE", "Tenor must be between " + p.minTenor() + " and " + p.maxTenor() + " months");
            }
            BorrowerRow b = db.sql("select * from borrowers where id = ? for update").param(borrower.borrowerId()).query(BorrowerRow.class).single();
            HistoryRow h = db.sql("""
                    select count(*) filter (where status = 'PAID_OFF')::int as closed_loans,
                           coalesce(max(max_dpd), 0)::int as worst_dpd,
                           coalesce(bool_or(status = 'WRITTEN_OFF'), false) as written_off,
                           count(*) filter (where status in ('DISBURSING', 'ACTIVE'))::int as open_loans
                    from loans where borrower_id = ?
                    """).param(b.id()).query(HistoryRow.class).single();
            if (h.openLoans() > 0) {
                throw ApiException.conflict("LOAN_OPEN", "Repay your current loan before applying again");
            }
            LocalDate today = clock.today();
            int age = Period.between(b.dateOfBirth(), today).getYears();
            int ageAtMaturity = Period.between(b.dateOfBirth(), today.plusMonths(r.tenor())).getYears();
            DecisionEngine.BureauReport report = bureau.pull(b.bvn());
            DecisionEngine.Decision d = engine.decide(
                    new DecisionEngine.Applicant(age, ageAtMaturity, Employment.valueOf(b.employment()), b.monthlyIncome()),
                    report,
                    new DecisionEngine.History(h.closedLoans(), h.worstDpd(), h.writtenOff()),
                    new DecisionEngine.Product(p.minAmount(), p.maxAmount(), p.maxTenor(), p.monthlyRateBps()),
                    new DecisionEngine.Request(r.amount(), r.tenor()));

            DecisionEngine.Outcome outcome = d.outcome();
            List<String> reasons = new ArrayList<>(d.reasons());
            boolean autoOffer = outcome == DecisionEngine.Outcome.APPROVE || outcome == DecisionEngine.Outcome.COUNTER;
            if (autoOffer && d.offerAmount() > props.policy().makerCheckerThreshold()) {
                outcome = DecisionEngine.Outcome.REFER;
                reasons.add("ABOVE_AUTO_APPROVAL_LIMIT");
            }
            String appStatus = switch (outcome) {
                case APPROVE, COUNTER -> "APPROVED";
                case REFER -> "REFERRED";
                case DECLINE -> "DECLINED";
            };
            Timestamp expires = "APPROVED".equals(appStatus) ? Timestamp.from(clock.now().plus(props.policy().offerTtl())) : null;
            String reference = References.next("APP");
            long appId;
            try {
                appId = db.sql("""
                        insert into applications (reference, borrower_id, product_code, amount, tenor_months, purpose, status,
                                                  offer_amount, offer_tenor, offer_expires_at, created_at, updated_at)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id
                        """)
                        .params(reference, b.id(), p.code(), r.amount(), r.tenor(), r.purpose().trim(), appStatus,
                                d.offerAmount(), d.offerTenor(), expires, Timestamp.from(clock.now()), Timestamp.from(clock.now()))
                        .query(Long.class).single();
            } catch (DuplicateKeyException e) {
                throw ApiException.conflict("APPLICATION_OPEN", "You already have an application in progress");
            }
            db.sql("""
                    insert into credit_reports (application_id, bureau, hit, score, active_facilities, delinquent_facilities, monthly_obligations)
                    values (?, ?, ?, ?, ?, ?, ?)
                    """)
                    .params(appId, bureau.name(), report.hit(), report.score(), report.activeFacilities(),
                            report.delinquentFacilities(), report.monthlyObligations())
                    .update();
            Map<String, Object> breakdown = new LinkedHashMap<>();
            breakdown.put("requested", Map.of("amount", r.amount(), "tenor", r.tenor()));
            breakdown.put("engineOutcome", d.outcome().name());
            breakdown.put("rules", d.rules());
            breakdown.put("factors", d.factors());
            breakdown.put("affordability", d.affordability());
            breakdown.put("cutoffs", Map.of("approve", DecisionEngine.APPROVE_AT, "refer", DecisionEngine.REFER_AT));
            db.sql("""
                    insert into decisions (application_id, policy_version, outcome, score, reasons, offer_amount, offer_tenor, breakdown)
                    values (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                    """)
                    .params(appId, DecisionEngine.POLICY_VERSION, outcome.name(), d.score(), reasons.toArray(String[]::new),
                            d.offerAmount(), d.offerTenor(), audit.json(breakdown))
                    .update();
            audit.record(borrower, "APPLICATION_SUBMITTED", "application", appId,
                    Map.of("reference", reference, "product", p.code(), "amount", r.amount(), "tenor", r.tenor()));
            Map<String, Object> decided = new LinkedHashMap<>();
            decided.put("outcome", outcome.name());
            decided.put("score", d.score());
            decided.put("reasons", reasons);
            if (d.offerAmount() != null) {
                decided.put("offerAmount", d.offerAmount());
                decided.put("offerTenor", d.offerTenor());
            }
            audit.record(Actor.SYSTEM, "CREDIT_DECISION", "application", appId, decided);
            return appId;
        });
    }

    public void approve(Actor staff, long appId, Long amount, Integer tenor, String note) {
        tx.executeWithoutResult(s -> {
            AppRow app = lock(appId);
            if (!"REFERRED".equals(app.status())) {
                throw ApiException.conflict("NOT_IN_REVIEW", "Only referred applications can be approved");
            }
            ProductRow p = db.sql("select * from products where code = ?").param(app.productCode()).query(ProductRow.class).single();
            long offer = amount != null ? amount : app.offerAmount() != null ? app.offerAmount() : app.amount();
            int months = tenor != null ? tenor : app.offerTenor() != null ? app.offerTenor() : app.tenorMonths();
            if (offer < p.minAmount() || offer > app.amount()) {
                throw ApiException.invalid("AMOUNT_OUT_OF_RANGE", "Offer must be between the product minimum and the amount requested");
            }
            if (months < p.minTenor() || months > p.maxTenor()) {
                throw ApiException.invalid("TENOR_OUT_OF_RANGE", "Tenor outside the product's range");
            }
            Long capacity = db.sql("select (breakdown -> 'affordability' ->> 'maxInstallment')::bigint from decisions where application_id = ?")
                    .param(appId).query(Long.class).optional().orElse(null);
            long monthly = Amortization.installment(offer, months, Amortization.rate(p.monthlyRateBps()));
            if (capacity != null && monthly > capacity) {
                long most = Amortization.maxPrincipalFor(capacity, months, p.monthlyRateBps(), 500_000);
                throw ApiException.invalid("UNAFFORDABLE", String.format(
                        "That is ₦%,d a month but this applicant can carry ₦%,d. Over %d months the most you can offer is ₦%,d.",
                        monthly / 100, capacity / 100, months, most / 100));
            }
            boolean needsChecker = offer > props.policy().makerCheckerThreshold();
            String next = needsChecker ? "PENDING_CHECKER" : "APPROVED";
            Timestamp expires = needsChecker ? null : Timestamp.from(clock.now().plus(props.policy().offerTtl()));
            db.sql("""
                    update applications set status = ?, offer_amount = ?, offer_tenor = ?, offer_expires_at = ?, maker_id = ?,
                           review_note = ?, updated_at = ? where id = ?
                    """)
                    .params(next, offer, months, expires, staff.staffId(), blankToNull(note), Timestamp.from(clock.now()), appId)
                    .update();
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("offerAmount", offer);
            detail.put("offerTenor", months);
            detail.put("next", next);
            if (note != null && !note.isBlank()) {
                detail.put("note", note.trim());
            }
            audit.record(staff, needsChecker ? "APPROVAL_PROPOSED" : "APPLICATION_APPROVED", "application", appId, detail);
        });
    }

    public void confirm(Actor staff, long appId) {
        if (!staff.isManager()) {
            throw ApiException.forbidden("MANAGER_ONLY", "Only a manager can give the second approval");
        }
        tx.executeWithoutResult(s -> {
            AppRow app = lock(appId);
            if (!"PENDING_CHECKER".equals(app.status())) {
                throw ApiException.conflict("NOT_AWAITING_CHECKER", "This application is not waiting for a second approval");
            }
            if (app.makerId() != null && app.makerId() == staff.staffId()) {
                throw ApiException.forbidden("FOUR_EYES", "The officer who proposed the approval can't also confirm it");
            }
            db.sql("update applications set status = 'APPROVED', checker_id = ?, offer_expires_at = ?, updated_at = ? where id = ?")
                    .params(staff.staffId(), Timestamp.from(clock.now().plus(props.policy().offerTtl())), Timestamp.from(clock.now()), appId)
                    .update();
            audit.record(staff, "APPROVAL_CONFIRMED", "application", appId, Map.of("offerAmount", app.offerAmount()));
        });
    }

    public void decline(Actor staff, long appId, String note) {
        tx.executeWithoutResult(s -> {
            AppRow app = lock(appId);
            if (!List.of("REFERRED", "PENDING_CHECKER").contains(app.status())) {
                throw ApiException.conflict("NOT_IN_REVIEW", "Only applications in review can be declined");
            }
            db.sql("update applications set status = 'DECLINED', review_note = ?, maker_id = coalesce(maker_id, ?), updated_at = ? where id = ?")
                    .params(blankToNull(note), staff.staffId(), Timestamp.from(clock.now()), appId)
                    .update();
            audit.record(staff, "APPLICATION_DECLINED", "application", appId, note == null || note.isBlank() ? Map.of() : Map.of("note", note.trim()));
        });
    }

    public Acceptance accept(Actor borrower, long appId) {
        record Next(String status, String authReference, Long loanId) {}
        Next next = tx.execute(s -> {
            AppRow app = lockOwned(borrower, appId);
            requireLiveOffer(app);
            Optional<Long> mandate = db.sql("select id from mandates where borrower_id = ? and active order by id desc limit 1")
                    .param(borrower.borrowerId()).query(Long.class).optional();
            if (mandate.isPresent()) {
                long loanId = createLoan(borrower, app, mandate.get());
                return new Next("DISBURSING", null, loanId);
            }
            String ref = References.next("AUTH");
            db.sql("insert into pending_authorizations (reference, application_id, borrower_id) values (?, ?, ?)")
                    .params(ref, appId, borrower.borrowerId()).update();
            audit.record(borrower, "OFFER_ACCEPTED", "application", appId, Map.of("cardAuthorization", ref));
            return new Next("CARD_REQUIRED", ref, null);
        });
        if (next.loanId() != null) {
            disbursements.dispatch(next.loanId());
            return new Acceptance(next.status(), null, next.loanId());
        }
        String url = gateway.startCardAuthorization(next.authReference(), email(borrower.borrowerId()), AUTHORIZATION_CHARGE);
        return new Acceptance(next.status(), url, null);
    }

    public void rejectOffer(Actor borrower, long appId) {
        tx.executeWithoutResult(s -> {
            AppRow app = lockOwned(borrower, appId);
            if (!"APPROVED".equals(app.status())) {
                throw ApiException.conflict("NO_OFFER", "There is no open offer on this application");
            }
            db.sql("update applications set status = 'REJECTED_BY_BORROWER', updated_at = ? where id = ?")
                    .params(Timestamp.from(clock.now()), appId).update();
            audit.record(borrower, "OFFER_REJECTED", "application", appId, Map.of());
        });
    }

    public Optional<Long> completeAuthorization(String reference, PaymentGateway.Card card) {
        Optional<Long> loanId = tx.execute(s -> {
            record Pending(long applicationId, long borrowerId, Timestamp completedAt) {}
            Pending p = db.sql("select application_id, borrower_id, completed_at from pending_authorizations where reference = ? for update")
                    .param(reference).query(Pending.class).optional()
                    .orElseThrow(() -> ApiException.notFound("Card authorization"));
            if (p.completedAt() != null) {
                return Optional.<Long>empty();
            }
            long mandateId = db.sql("""
                    insert into mandates (borrower_id, authorization_code, card_type, last4, exp_month, exp_year, bank)
                    values (?, ?, ?, ?, ?, ?, ?)
                    on conflict (authorization_code) do update set active = true
                    returning id
                    """)
                    .params(p.borrowerId(), card.authorizationCode(), card.cardType(), card.last4(), card.expMonth(), card.expYear(), card.bank())
                    .query(Long.class).single();
            db.sql("update pending_authorizations set completed_at = ? where reference = ?")
                    .params(Timestamp.from(clock.now()), reference).update();
            String name = db.sql("select first_name || ' ' || last_name from borrowers where id = ?").param(p.borrowerId()).query(String.class).single();
            Actor borrower = new Actor(Actor.Type.BORROWER, p.borrowerId(), name, "BORROWER");
            audit.record(borrower, "CARD_LINKED", "borrower", p.borrowerId(), Map.of("card", card.cardType() + " " + card.last4()));
            AppRow app = lock(p.applicationId());
            if (!"APPROVED".equals(app.status())) {
                return Optional.<Long>empty();
            }
            return Optional.of(createLoan(borrower, app, mandateId));
        });
        loanId.ifPresent(disbursements::dispatch);
        return loanId;
    }

    private long createLoan(Actor borrower, AppRow app, long mandateId) {
        ProductRow p = db.sql("select * from products where code = ?").param(app.productCode()).query(ProductRow.class).single();
        Amortization.Quote q = Amortization.quote(app.offerAmount(), app.offerTenor(), p.monthlyRateBps(), p.feeBps(), clock.today());
        long loanId = db.sql("""
                insert into loans (reference, application_id, borrower_id, product_code, principal, fee, disbursed_amount,
                                   monthly_rate_bps, late_fee_bps, tenor_months, installment_amount, total_interest, apr_bps,
                                   status, mandate_id)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISBURSING', ?) returning id
                """)
                .params(References.next("LN"), app.id(), app.borrowerId(), p.code(), q.principal(), q.fee(), q.disbursed(),
                        p.monthlyRateBps(), p.lateFeeBps(), q.tenorMonths(), q.installment(), q.totalInterest(), q.aprBps(), mandateId)
                .query(Long.class).single();
        record Bank(String bankCode, String accountNumber) {}
        Bank bank = db.sql("select bank_code, account_number from borrowers where id = ?").param(app.borrowerId()).query(Bank.class).single();
        db.sql("""
                insert into disbursements (loan_id, reference, amount, bank_code, account_number, status)
                values (?, ?, ?, ?, ?, 'PENDING')
                """)
                .params(loanId, References.next("DSB"), q.disbursed(), bank.bankCode(), bank.accountNumber())
                .update();
        db.sql("update applications set status = 'ACCEPTED', updated_at = ? where id = ?").params(Timestamp.from(clock.now()), app.id()).update();
        audit.record(borrower, "LOAN_BOOKED", "loan", loanId, Map.of("application", app.reference(), "principal", q.principal(), "fee", q.fee()));
        return loanId;
    }

    private void requireLiveOffer(AppRow app) {
        if (!"APPROVED".equals(app.status())) {
            throw ApiException.conflict("NO_OFFER", "There is no open offer on this application");
        }
        if (app.offerExpiresAt() != null && !app.offerExpiresAt().toInstant().isAfter(clock.now())) {
            throw ApiException.conflict("OFFER_EXPIRED", "This offer has expired. Apply again for a fresh decision.");
        }
    }

    private AppRow lock(long appId) {
        return db.sql("select * from applications where id = ? for update").param(appId).query(AppRow.class).optional()
                .orElseThrow(() -> ApiException.notFound("Application"));
    }

    private AppRow lockOwned(Actor borrower, long appId) {
        AppRow app = lock(appId);
        if (app.borrowerId() != borrower.borrowerId()) {
            throw ApiException.notFound("Application");
        }
        return app;
    }

    private String email(long borrowerId) {
        return "b" + borrowerId + "@borrowers.credline.ng";
    }

    static String mask(String phone) {
        return phone.substring(0, 4) + "****" + phone.substring(8);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
