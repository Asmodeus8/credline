package ng.credline.payments;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class PaystackWebhookTest {

    private static final String SECRET = "sk_test_webhook";

    @Test
    void acceptsOnlyTheExactSignedBody() throws Exception {
        byte[] body = "{\"event\":\"transfer.success\",\"data\":{\"reference\":\"DSB-1\"}}".getBytes(StandardCharsets.UTF_8);
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        String signature = HexFormat.of().formatHex(mac.doFinal(body));
        assertThat(PaystackWebhook.valid(body, signature, SECRET)).isTrue();
        assertThat(PaystackWebhook.valid(body, signature.toUpperCase(), SECRET)).isTrue();
        assertThat(PaystackWebhook.valid(body, signature, "sk_test_other")).isFalse();
        byte[] tampered = "{\"event\":\"transfer.success\",\"data\":{\"reference\":\"DSB-2\"}}".getBytes(StandardCharsets.UTF_8);
        assertThat(PaystackWebhook.valid(tampered, signature, SECRET)).isFalse();
        assertThat(PaystackWebhook.valid(body, "not-hex", SECRET)).isFalse();
    }
}
