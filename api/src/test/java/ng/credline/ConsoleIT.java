package ng.credline;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class ConsoleIT extends IntegrationTest {

    @Test
    void everyConsoleTabAnswers() {
        long loanId = activeLoan("reliable", 6_000_000, 3);
        Client ada = staff("ada");
        ada.post("/api/console/loans/" + loanId + "/repayments", Map.of("amount", 500_000, "reference", "TABS-" + loanId)).ok();
        for (String path : new String[] {"/api/console/overview", "/api/console/borrowers", "/api/console/disbursements", "/api/console/repayments",
                "/api/console/reports", "/api/console/products", "/api/console/team", "/api/console/search?q=Test"}) {
            assertThat(ada.get(path).status()).as(path).isEqualTo(200);
        }
        assertThat(ada.get("/api/console/overview").get("trends")).hasSize(12);
        assertThat(ada.get("/api/console/repayments?channel=TRANSFER").get("rows").valueStream()
                .anyMatch(r -> r.path("reference").asString().equals("TRF-TABS-" + loanId))).isTrue();
        assertThat(ada.get("/api/console/search?q=LN-").get("loans")).isNotEmpty();
    }

    @Test
    void borrowerFilesMaskTheBvnAndShowTheirHistory() {
        long loanId = activeLoan("reliable", 5_000_000, 2);
        long borrowerId = db.sql("select borrower_id from loans where id = ?").param(loanId).query(Long.class).single();
        String bvn = db.sql("select bvn from borrowers where id = ?").param(borrowerId).query(String.class).single();
        JsonNode file = staff("ada").get("/api/console/borrowers/" + borrowerId).ok().body();
        assertThat(file.path("bvn").asString()).isEqualTo("xxxxxxx" + bvn.substring(7)).doesNotContain(bvn.substring(0, 7));
        assertThat(file.path("loans")).hasSize(1);
        assertThat(file.path("activity").valueStream().map(e -> e.path("action").asString()).toList()).contains("LOAN_DISBURSED", "CARD_LINKED");
    }

    @Test
    void onlyManagersChangePricingAndEveryChangeIsAudited() {
        Map<String, Object> change = Map.of("minAmount", 1_000_000, "maxAmount", 12_000_000, "minTenor", 1, "maxTenor", 3,
                "monthlyRateBps", 575, "feeBps", 0, "lateFeeBps", 200);
        assertThat(staff("ada").call("PUT", "/api/console/products/QUICK", change).status()).isEqualTo(403);
        Client tunde = staff("tunde");
        JsonNode updated = tunde.call("PUT", "/api/console/products/QUICK", change).ok().body();
        assertThat(updated.path("monthlyRateBps").asInt()).isEqualTo(575);
        assertThat(updated.path("maxAmount").asLong()).isEqualTo(12_000_000);
        String detail = db.sql("select detail::text from audit_events where action = 'PRODUCT_UPDATED' order by id desc limit 1").query(String.class).single();
        assertThat(detail).contains("6.00% → 5.75%").contains("QUICK");
        long entries = db.sql("select count(*) from audit_events where action = 'PRODUCT_UPDATED'").query(Long.class).single();
        tunde.call("PUT", "/api/console/products/QUICK", change).ok();
        assertThat(db.sql("select count(*) from audit_events where action = 'PRODUCT_UPDATED'").query(Long.class).single()).isEqualTo(entries);
        Map<String, Object> broken = Map.of("minAmount", 5_000_000, "maxAmount", 1_000_000, "minTenor", 1, "maxTenor", 3,
                "monthlyRateBps", 575, "feeBps", 0, "lateFeeBps", 200);
        assertThat(tunde.call("PUT", "/api/console/products/QUICK", broken).status()).isEqualTo(422);
        tunde.call("PUT", "/api/console/products/QUICK", Map.of("minAmount", 1_000_000, "maxAmount", 10_000_000, "minTenor", 1, "maxTenor", 3,
                "monthlyRateBps", 600, "feeBps", 0, "lateFeeBps", 200)).ok();
    }
}
