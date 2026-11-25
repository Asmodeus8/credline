package ng.credline.payments;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import ng.credline.CredlineProperties;
import ng.credline.collections.EndOfDay;
import ng.credline.loans.Disbursements;
import ng.credline.origination.Origination;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
class PaystackWebhook {

    private final CredlineProperties props;
    private final JsonMapper json;
    private final JdbcClient db;
    private final Origination origination;
    private final Disbursements disbursements;
    private final EndOfDay endOfDay;

    PaystackWebhook(CredlineProperties props, JsonMapper json, JdbcClient db, Origination origination,
                    Disbursements disbursements, EndOfDay endOfDay) {
        this.props = props;
        this.json = json;
        this.db = db;
        this.origination = origination;
        this.disbursements = disbursements;
        this.endOfDay = endOfDay;
    }

    @PostMapping("/api/webhooks/paystack")
    ResponseEntity<Void> receive(@RequestBody byte[] body, @RequestHeader(name = "x-paystack-signature", required = false) String signature) {
        String secret = props.payments().paystackSecret();
        if (secret == null || secret.isBlank() || signature == null || !valid(body, signature, secret)) {
            return ResponseEntity.status(401).build();
        }
        JsonNode event = json.readTree(new String(body, StandardCharsets.UTF_8));
        String type = event.path("event").asString("");
        JsonNode data = event.path("data");
        String reference = data.path("reference").asString("");
        String id = type + ":" + data.path("id").asString(reference);
        boolean fresh = db.sql("insert into webhook_events (id, type) values (?, ?) on conflict do nothing").params(id, type).update() == 1;
        if (!fresh) {
            return ResponseEntity.ok().build();
        }
        switch (type) {
            case "charge.success" -> {
                if (reference.startsWith("AUTH-")) {
                    JsonNode a = data.path("authorization");
                    if (a.path("reusable").asBoolean(false)) {
                        origination.completeAuthorization(reference, new PaymentGateway.Card(
                                a.path("authorization_code").asString(), a.path("card_type").asString("card").trim(),
                                a.path("last4").asString(), a.path("exp_month").asInt(), a.path("exp_year").asInt(), a.path("bank").asString(null)));
                    }
                } else if (reference.startsWith("DBT-")) {
                    endOfDay.resolve(reference, PaymentGateway.Result.success());
                }
            }
            case "charge.failed" -> {
                if (reference.startsWith("DBT-")) {
                    endOfDay.resolve(reference, PaymentGateway.Result.failed(data.path("gateway_response").asString("Declined")));
                }
            }
            case "transfer.success" -> disbursements.complete(reference, true, null);
            case "transfer.failed", "transfer.reversed" -> disbursements.complete(reference, false, type);
            default -> { }
        }
        return ResponseEntity.ok().build();
    }

    static boolean valid(byte[] body, String signature, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            byte[] expected = mac.doFinal(body);
            byte[] given = HexFormat.of().parseHex(signature.trim().toLowerCase());
            return MessageDigest.isEqual(expected, given);
        } catch (IllegalArgumentException e) {
            return false;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
