package ng.credline;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class OriginationIT extends IntegrationTest {

    @Test
    void referralAboveTheThresholdNeedsASecondPairOfEyes() {
        Applicant a = apply("BUSINESS", 45_000_000, 6, 2, 25_000_000, "SELF_EMPLOYED");
        assertThat(a.status()).isEqualTo("REFERRED");

        Client ada = staff("ada");
        JsonNode file = ada.get("/api/console/applications/" + a.applicationId()).ok().body();
        assertThat(file.path("decision").path("reasons").valueStream().map(JsonNode::asString).toList()).contains("SCORE_IN_REVIEW_BAND");
        assertThat(file.path("decision").path("breakdown").path("factors")).isNotEmpty();
        assertThat(file.path("bureau").path("score").asInt()).isBetween(550, 570);

        JsonNode proposed = ada.post("/api/console/applications/" + a.applicationId() + "/approve",
                Map.of("amount", 40_000_000, "tenor", 6, "note", "Six months of statements check out")).ok().body();
        assertThat(proposed.path("status").asString()).isEqualTo("PENDING_CHECKER");
        assertThat(a.client().post("/api/me/applications/" + a.applicationId() + "/accept", null).status()).isEqualTo(409);

        assertThat(ada.post("/api/console/applications/" + a.applicationId() + "/confirm", null).status()).isEqualTo(403);
        assertThat(staff("kunle").post("/api/console/applications/" + a.applicationId() + "/confirm", null).status()).isEqualTo(403);
        JsonNode confirmed = staff("tunde").post("/api/console/applications/" + a.applicationId() + "/confirm", null).ok().body();
        assertThat(confirmed.path("status").asString()).isEqualTo("APPROVED");
        assertThat(confirmed.path("makerName").asString()).isEqualTo("Ada Okafor");
        assertThat(confirmed.path("checkerName").asString()).isEqualTo("Tunde Bakare");
        assertThat(confirmed.path("audit").valueStream().map(e -> e.path("action").asString()).toList())
                .containsSubsequence("APPLICATION_SUBMITTED", "CREDIT_DECISION", "APPROVAL_PROPOSED", "APPROVAL_CONFIRMED");
    }

    @Test
    void officersCannotApproveBeyondWhatTheApplicantCanAfford() {
        Applicant a = apply("BUSINESS", 190_000_000, 11, 2, 15_000_000, "SELF_EMPLOYED");
        assertThat(a.status()).isEqualTo("REFERRED");
        Res tooMuch = staff("ada").post("/api/console/applications/" + a.applicationId() + "/approve", Map.of("amount", 184_500_000, "tenor", 11));
        assertThat(tooMuch.status()).isEqualTo(422);
        assertThat(tooMuch.get("code").asString()).isEqualTo("UNAFFORDABLE");
        assertThat(tooMuch.get("detail").asString()).contains("most you can offer");
        assertThat(db.sql("select status from applications where id = ?").param(a.applicationId()).query(String.class).single()).isEqualTo("REFERRED");
    }

    @Test
    void aManagerCannotConfirmTheirOwnProposal() {
        Applicant a = apply("BUSINESS", 45_000_000, 6, 2, 25_000_000, "SELF_EMPLOYED");
        Client tunde = staff("tunde");
        tunde.post("/api/console/applications/" + a.applicationId() + "/approve", Map.of("amount", 35_000_000)).ok();
        Res own = tunde.post("/api/console/applications/" + a.applicationId() + "/confirm", null);
        assertThat(own.status()).isEqualTo(403);
        assertThat(own.get("code").asString()).isEqualTo("FOUR_EYES");
    }

    @Test
    void declinesExplainThemselvesAndBlockNothingElse() {
        Applicant a = apply("SALARY", 10_000_000, 3, 0, 40_000_000, "SALARIED");
        assertThat(a.status()).isEqualTo("DECLINED");
        assertThat(a.body().path("decision").path("reasons").valueStream().map(JsonNode::asString).toList()).containsExactly("BUREAU_DELINQUENCY");
        Res again = a.client().post("/api/me/applications", Map.of("product", "QUICK", "amount", 2_000_000, "tenor", 1, "purpose", "School fees"));
        assertThat(again.status()).isEqualTo(201);
    }

    @Test
    void oneOpenApplicationAndOneOpenLoanPerBorrower() {
        Applicant a = apply("SALARY", 10_000_000, 3, 9, 40_000_000, "SALARIED");
        Res second = a.client().post("/api/me/applications", Map.of("product", "QUICK", "amount", 2_000_000, "tenor", 1, "purpose", "Rent"));
        assertThat(second.status()).isEqualTo(409);
        assertThat(second.get("code").asString()).isEqualTo("APPLICATION_OPEN");
    }

    @Test
    void borrowersSignInWithPhoneAndPin() {
        Applicant a = apply("QUICK", 2_000_000, 1, 7, 30_000_000, "SALARIED");
        String phone = db.sql("select b.phone from borrowers b join applications a on a.borrower_id = b.id where a.id = ?")
                .param(a.applicationId()).query(String.class).single();
        Res login = new Client().post("/api/auth/borrower", Map.of("phone", phone, "pin", "1234"));
        assertThat(login.ok().get("type").asString()).isEqualTo("BORROWER");
        assertThat(new Client().post("/api/auth/borrower", Map.of("phone", phone, "pin", "9999")).status()).isEqualTo(401);
    }
}
