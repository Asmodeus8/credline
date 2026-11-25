package ng.credline.sandbox;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import ng.credline.common.AuditLog;
import ng.credline.common.BusinessClock;
import ng.credline.common.Rows;
import ng.credline.collections.EndOfDay;
import ng.credline.origination.Origination;
import ng.credline.payments.SandboxGateway;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sandbox")
@ConditionalOnExpression("'${credline.payments.provider}' != 'paystack'")
class SandboxController {

    private final JdbcClient db;
    private final Rows rows;
    private final BusinessClock clock;
    private final EndOfDay endOfDay;
    private final Origination origination;
    private final AuditLog audit;

    SandboxController(JdbcClient db, Rows rows, BusinessClock clock, EndOfDay endOfDay, Origination origination, AuditLog audit) {
        this.db = db;
        this.rows = rows;
        this.clock = clock;
        this.endOfDay = endOfDay;
        this.origination = origination;
        this.audit = audit;
    }

    record Advance(@Min(1) @Max(120) int days) {}

    record Checkout(@NotBlank String card) {}

    @GetMapping("/clock")
    Map<String, Object> clock() {
        return Map.of("today", clock.today(), "offsetDays", clock.offset());
    }

    @PostMapping("/clock/advance")
    Map<String, Object> advance(@Valid @RequestBody Advance body) {
        LocalDate from = clock.today();
        List<EndOfDay.Summary> days = new ArrayList<>();
        synchronized (this) {
            endOfDay.run(clock.today());
            for (int i = 0; i < body.days(); i++) {
                db.sql("update sandbox_clock set offset_days = offset_days + 1 where id = 1").update();
                clock.reload();
                days.add(endOfDay.run(clock.today()));
            }
        }
        audit.record(Actor.current(), "CLOCK_ADVANCED", "sandbox", 1, Map.of("from", from.toString(), "to", clock.today().toString()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", clock.today());
        out.put("offsetDays", clock.offset());
        out.put("debitsAttempted", days.stream().mapToInt(EndOfDay.Summary::debitsAttempted).sum());
        out.put("debitsSucceeded", days.stream().mapToInt(EndOfDay.Summary::debitsSucceeded).sum());
        out.put("lateFeesCharged", days.stream().mapToInt(EndOfDay.Summary::lateFeesCharged).sum());
        out.put("bucketChanges", days.stream().mapToInt(EndOfDay.Summary::bucketChanges).sum());
        out.put("offersExpired", days.stream().mapToInt(EndOfDay.Summary::offersExpired).sum());
        return out;
    }

    @GetMapping("/checkout/{reference}")
    Map<String, Object> checkout(@PathVariable String reference) {
        Map<String, Object> out = rows.one(db.sql("""
                select p.reference, p.completed_at, a.reference as application_reference, a.offer_amount, a.offer_tenor,
                       b.first_name, pr.name as product_name
                from pending_authorizations p join applications a on a.id = p.application_id
                join borrowers b on b.id = p.borrower_id join products pr on pr.code = a.product_code
                where p.reference = ?
                """).param(reference)).orElseThrow(() -> ApiException.notFound("Checkout"));
        out.put("amount", Origination.AUTHORIZATION_CHARGE);
        out.put("cards", SandboxGateway.CARDS);
        return out;
    }

    @PostMapping("/checkout/{reference}")
    Map<String, Object> pay(@PathVariable String reference, @Valid @RequestBody Checkout body) {
        SandboxGateway.TestCard card = SandboxGateway.CARDS.stream().filter(c -> c.id().equals(body.card())).findFirst()
                .orElseThrow(() -> ApiException.invalid("UNKNOWN_CARD", "Pick one of the test cards"));
        Long loanId = origination.completeAuthorization(reference, SandboxGateway.issue(card)).orElse(null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", loanId == null ? "ALREADY_COMPLETED" : "DISBURSING");
        out.put("loanId", loanId);
        return out;
    }
}
