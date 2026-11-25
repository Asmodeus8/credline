package ng.credline.payments;

import java.util.HashMap;
import java.util.Map;
import ng.credline.CredlineProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

public class PaystackGateway implements PaymentGateway {

    private final RestClient http;
    private final String callbackUrl;

    public PaystackGateway(CredlineProperties props, RestClient.Builder builder) {
        if (props.payments().paystackSecret() == null || props.payments().paystackSecret().isBlank()) {
            throw new IllegalStateException("PAYSTACK_SECRET_KEY is required when PAYMENTS_PROVIDER=paystack");
        }
        this.callbackUrl = props.payments().callbackUrl();
        this.http = builder
                .baseUrl("https://api.paystack.co")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + props.payments().paystackSecret())
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    @Override
    public String name() {
        return "paystack";
    }

    @Override
    public String startCardAuthorization(String reference, String email, long amount) {
        Map<String, Object> body = Map.of(
                "email", email,
                "amount", amount,
                "reference", reference,
                "callback_url", callbackUrl,
                "channels", new String[] {"card"},
                "metadata", Map.of("purpose", "mandate"));
        JsonNode res = post("/transaction/initialize", body);
        return res.path("data").path("authorization_url").asString();
    }

    @Override
    public Result charge(Card card, String email, long amount, String reference) {
        try {
            JsonNode res = post("/transaction/charge_authorization", Map.of(
                    "authorization_code", card.authorizationCode(),
                    "email", email,
                    "amount", amount,
                    "reference", reference));
            String status = res.path("data").path("status").asString("");
            return switch (status) {
                case "success" -> Result.success();
                case "failed" -> Result.failed(res.path("data").path("gateway_response").asString("Declined"));
                default -> Result.pending();
            };
        } catch (RestClientResponseException e) {
            return Result.failed("Paystack " + e.getStatusCode().value());
        }
    }

    @Override
    public Result transfer(String reference, long amount, String bankCode, String accountNumber, String accountName) {
        try {
            Map<String, Object> recipient = new HashMap<>();
            recipient.put("type", "nuban");
            recipient.put("name", accountName);
            recipient.put("account_number", accountNumber);
            recipient.put("bank_code", bankCode);
            recipient.put("currency", "NGN");
            String code = post("/transferrecipient", recipient).path("data").path("recipient_code").asString();
            JsonNode res = post("/transfer", Map.of(
                    "source", "balance",
                    "amount", amount,
                    "recipient", code,
                    "reference", reference,
                    "reason", "Loan disbursement " + reference));
            String status = res.path("data").path("status").asString("");
            return "success".equals(status) ? Result.success() : "failed".equals(status) ? Result.failed("Transfer failed") : Result.pending();
        } catch (RestClientResponseException e) {
            return Result.failed("Paystack " + e.getStatusCode().value());
        }
    }

    private JsonNode post(String path, Object body) {
        return http.post().uri(path).body(body).retrieve().body(JsonNode.class);
    }
}
