package ng.credline;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class LoanLifecycleIT extends IntegrationTest {

    @Test
    void reliableBorrowerGoesFromApplicationToPaidOffByCardDebits() {
        Applicant a = apply("SALARY", 15_000_000, 3, 9, 40_000_000, "SALARIED");
        assertThat(a.status()).isEqualTo("APPROVED");
        assertThat(a.body().path("decision").has("score")).isFalse();

        Res offer = a.client().get("/api/me/applications/" + a.applicationId()).ok();
        assertThat(offer.get("offer").path("schedule")).hasSize(3);
        assertThat(offer.get("offer").path("fee").asLong()).isEqualTo(150_000);

        Res accepted = a.client().post("/api/me/applications/" + a.applicationId() + "/accept", null).ok();
        assertThat(accepted.get("status").asString()).isEqualTo("CARD_REQUIRED");
        String url = accepted.get("checkoutUrl").asString();
        assertThat(url).startsWith("http://app.test/checkout/AUTH-");
        String ref = url.substring(url.lastIndexOf('/') + 1);
        long loanId = new Client().post("/api/sandbox/checkout/" + ref, Map.of("card", "reliable")).ok().get("loanId").asLong();
        assertThat(new Client().post("/api/sandbox/checkout/" + ref, Map.of("card", "reliable")).ok().get("status").asString())
                .isEqualTo("ALREADY_COMPLETED");

        JsonNode loan = a.client().get("/api/me/loans/" + loanId).ok().body();
        assertThat(loan.path("status").asString()).isEqualTo("ACTIVE");
        assertThat(loan.path("disbursedAmount").asLong()).isEqualTo(15_000_000 - 150_000);
        assertThat(loan.path("schedule")).hasSize(3);
        assertThat(loan.path("disbursementStatus").asString()).isEqualTo("SUCCESS");

        LocalDate maturity = LocalDate.parse(loan.path("maturityDate").asString());
        advanceTo(maturity.plusDays(1));

        JsonNode done = a.client().get("/api/me/loans/" + loanId).ok().body();
        assertThat(done.path("status").asString()).isEqualTo("PAID_OFF");
        assertThat(done.path("principalPaid").asLong()).isEqualTo(15_000_000);
        assertThat(done.path("feesPaid").asLong()).isZero();
        assertThat(done.path("maxDpd").asInt()).isZero();
        assertThat(done.path("schedule").valueStream().map(i -> i.path("status").asString()).toList()).containsOnly("PAID");
        long collected = db.sql("select sum(amount) from repayments where loan_id = ? and channel = 'CARD_DEBIT'").param(loanId).query(Long.class).single();
        assertThat(collected).isEqualTo(15_000_000 + done.path("totalInterest").asLong());
    }

    @Test
    void declinedCardFallsBehindIsRetriedOnScheduleAndChargedOneLateFee() {
        long loanId = activeLoan("declined", 10_000_000, 3);
        LocalDate due = firstDue(loanId);
        advanceTo(due.plusDays(10));

        Map<String, Object> l = db.sql("select dpd, bucket from loans where id = ?").param(loanId).query().singleRow();
        assertThat(l.get("dpd")).isEqualTo(10);
        assertThat(l.get("bucket")).isEqualTo("DPD_1_30");
        List<LocalDate> attempts = db.sql("select business_date from debit_attempts where loan_id = ? order by 1").param(loanId).query(LocalDate.class).list();
        assertThat(attempts).containsExactly(due, due.plusDays(1), due.plusDays(3), due.plusDays(7));
        assertThat(db.sql("select count(*) from debit_attempts where loan_id = ? and status = 'FAILED'").param(loanId).query(Long.class).single()).isEqualTo(4);
        List<Long> fees = db.sql("select late_fee_due from installments where loan_id = ? order by seq").param(loanId).query(Long.class).list();
        long instalment = db.sql("select principal_due + interest_due from installments where loan_id = ? and seq = 1").param(loanId).query(Long.class).single();
        assertThat(fees).containsExactly(Math.round(instalment / 100.0), 0L, 0L);

        advanceTo(due.plusDays(35));
        assertThat(db.sql("select bucket from loans where id = ?").param(loanId).query(String.class).single()).isEqualTo("DPD_31_60");
        assertThat(db.sql("select count(*) from loan_events where loan_id = ? and type = 'BUCKET_CHANGED'").param(loanId).query(Long.class).single()).isEqualTo(2);

        Client officer = staff("ada");
        JsonNode view = officer.get("/api/console/loans/" + loanId).ok().body();
        long overdue = view.path("overdue").asLong();
        assertThat(overdue).isGreaterThan(instalment);
        JsonNode receipt = officer.post("/api/console/loans/" + loanId + "/repayments", Map.of("amount", overdue, "reference", "NIP-TRANSFER-" + loanId)).ok().body();
        assertThat(receipt.path("toLateFees").asLong()).isEqualTo(Math.round(instalment / 100.0) + db.sql("select late_fee_due from installments where loan_id = ? and seq = 2").param(loanId).query(Long.class).single());
        Map<String, Object> after = db.sql("select dpd, bucket, max_dpd from loans where id = ?").param(loanId).query().singleRow();
        assertThat(after.get("dpd")).isEqualTo(0);
        assertThat(after.get("bucket")).isEqualTo("CURRENT");
        assertThat(after.get("max_dpd")).isEqualTo(35);
    }

    @Test
    void writeOffNeedsAManagerAndNinetyOneDaysPastDue() {
        long loanId = activeLoan("declined", 5_000_000, 2);
        LocalDate due = firstDue(loanId);
        advanceTo(due.plusDays(60));
        Client manager = staff("tunde");
        assertThat(staff("ada").post("/api/console/loans/" + loanId + "/write-off", Map.of()).status()).isEqualTo(403);
        assertThat(manager.post("/api/console/loans/" + loanId + "/write-off", Map.of()).status()).isEqualTo(409);
        advanceTo(due.plusDays(91));
        JsonNode written = manager.post("/api/console/loans/" + loanId + "/write-off", Map.of("note", "Unreachable")).ok().body();
        assertThat(written.path("status").asString()).isEqualTo("WRITTEN_OFF");
        assertThat(written.path("writtenOffAmount").asLong()).isEqualTo(5_000_000);
    }

    @Test
    void borrowersPayEarlyAndCloseWithFutureInterestWaived() {
        Applicant a = apply("SALARY", 12_000_000, 6, 8, 50_000_000, "CIVIL_SERVANT");
        Res accepted = a.client().post("/api/me/applications/" + a.applicationId() + "/accept", null).ok();
        String url = accepted.get("checkoutUrl").asString();
        long loanId = new Client().post("/api/sandbox/checkout/" + url.substring(url.lastIndexOf('/') + 1), Map.of("card", "late")).ok().get("loanId").asLong();
        JsonNode loan = a.client().get("/api/me/loans/" + loanId).ok().body();
        long payoff = loan.path("payoff").asLong();
        long fullSchedule = loan.path("principal").asLong() + loan.path("totalInterest").asLong();
        assertThat(payoff).isLessThan(fullSchedule);
        assertThat(a.client().post("/api/me/loans/" + loanId + "/repayments", Map.of("amount", payoff + 1, "idempotencyKey", "early-close-1")).status()).isEqualTo(422);
        JsonNode receipt = a.client().post("/api/me/loans/" + loanId + "/repayments", Map.of("amount", payoff, "idempotencyKey", "early-close-1")).ok().body();
        assertThat(receipt.path("loanClosed").asBoolean()).isTrue();
        JsonNode again = a.client().post("/api/me/loans/" + loanId + "/repayments", Map.of("amount", payoff, "idempotencyKey", "early-close-1")).ok().body();
        assertThat(again.path("duplicate").asBoolean()).isTrue();
        assertThat(again.path("id").asLong()).isEqualTo(receipt.path("id").asLong());
        JsonNode closed = a.client().get("/api/me/loans/" + loanId).ok().body();
        assertThat(closed.path("status").asString()).isEqualTo("PAID_OFF");
        assertThat(closed.path("interestWaived").asLong()).isEqualTo(fullSchedule - payoff);
    }

    @Test
    void borrowersCannotSeeEachOthersLoans() {
        long loanId = activeLoan("reliable", 5_000_000, 1);
        Applicant other = apply("QUICK", 2_000_000, 1, 7, 30_000_000, "SALARIED");
        assertThat(other.client().get("/api/me/loans/" + loanId).status()).isEqualTo(404);
        assertThat(other.client().get("/api/console/overview").status()).isEqualTo(403);
        assertThat(new Client().get("/api/me").status()).isEqualTo(401);
        assertThat(staff("ada").get("/api/console/loans/not-a-number").status()).isEqualTo(400);
    }
}
