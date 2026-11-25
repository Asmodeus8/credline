package ng.credline;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import ng.credline.common.BusinessClock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "credline.payments.provider=sandbox",
        "credline.collections.cron=-",
        "credline.payments.public-url=http://app.test"
})
@Import(TestcontainersConfiguration.class)
public abstract class IntegrationTest {

    @LocalServerPort
    int port;

    @Autowired
    protected JdbcClient db;

    @Autowired
    protected JsonMapper json;

    @Autowired
    protected BusinessClock clock;

    public record Res(int status, JsonNode body) {
        public Res ok() {
            assertThat(status).as("status for %s", body).isBetween(200, 299);
            return this;
        }

        public JsonNode get(String field) {
            return body.path(field);
        }
    }

    public class Client {
        private final HttpClient http = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();

        public Res get(String path) {
            return send(HttpRequest.newBuilder(uri(path)).GET());
        }

        public Res post(String path, Object body) {
            return send(HttpRequest.newBuilder(uri(path))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body == null ? Map.of() : body))));
        }

        private Res send(HttpRequest.Builder req) {
            try {
                HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
                JsonNode node = res.body().isBlank() ? json.createObjectNode() : json.readTree(res.body());
                return new Res(res.statusCode(), node);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        private URI uri(String path) {
            return URI.create("http://localhost:" + port + path);
        }
    }

    public record Applicant(Client client, long applicationId, String status, JsonNode body) {}

    protected Client staff(String who) {
        Client c = new Client();
        c.post("/api/auth/staff", Map.of("email", who + "@credline.ng", "password", "credline-demo")).ok();
        return c;
    }

    protected Applicant apply(String product, long amount, int tenor, int bvnLastDigit, long income, String employment) {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        String phone = "080" + String.format("%08d", r.nextInt(100_000_000));
        String bvn = String.format("%010d", r.nextLong(10_000_000_000L)) + bvnLastDigit;
        Map<String, Object> borrower = new LinkedHashMap<>();
        borrower.put("firstName", "Test");
        borrower.put("lastName", "Borrower" + r.nextInt(1000));
        borrower.put("phone", phone);
        borrower.put("bvn", bvn);
        borrower.put("dateOfBirth", LocalDate.of(1990, 5, 17).toString());
        borrower.put("employment", employment);
        borrower.put("employer", "Acme Ltd");
        borrower.put("monthlyIncome", income);
        borrower.put("bankCode", "058");
        borrower.put("accountNumber", String.format("%010d", r.nextLong(1, 9_999_999_999L)).replaceAll("0000$", "0001"));
        borrower.put("pin", "1234");
        Client c = new Client();
        Res res = c.post("/api/applications", Map.of("borrower", borrower,
                "loan", Map.of("product", product, "amount", amount, "tenor", tenor, "purpose", "Rent"))).ok();
        return new Applicant(c, res.get("id").asLong(), res.get("status").asString(), res.body());
    }

    protected long activeLoan(String card, long amount, int tenor) {
        Applicant a = apply("SALARY", amount, tenor, 9, 60_000_000, "SALARIED");
        assertThat(a.status()).isEqualTo("APPROVED");
        Res accepted = a.client().post("/api/me/applications/" + a.applicationId() + "/accept", null).ok();
        String url = accepted.get("checkoutUrl").asString();
        String ref = url.substring(url.lastIndexOf('/') + 1);
        long loanId = new Client().post("/api/sandbox/checkout/" + ref, Map.of("card", card)).ok().get("loanId").asLong();
        assertThat(status(loanId)).isEqualTo("ACTIVE");
        return loanId;
    }

    protected String status(long loanId) {
        return db.sql("select status from loans where id = ?").param(loanId).query(String.class).single();
    }

    protected LocalDate firstDue(long loanId) {
        return db.sql("select min(due_date) from installments where loan_id = ?").param(loanId).query(LocalDate.class).single();
    }

    protected void advanceTo(LocalDate target) {
        Client manager = staff("tunde");
        while (clock.today().isBefore(target)) {
            int days = (int) Math.min(120, java.time.temporal.ChronoUnit.DAYS.between(clock.today(), target));
            manager.post("/api/sandbox/clock/advance", Map.of("days", days)).ok();
        }
    }
}
