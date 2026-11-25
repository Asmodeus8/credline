package ng.credline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import ng.credline.collections.EndOfDay;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;

class IntegrityIT extends IntegrationTest {

    @Autowired
    EndOfDay endOfDay;

    @Test
    void parallelRepaymentsAllLandAndNeverOverpayAnInstalment() throws Exception {
        long loanId = activeLoan("reliable", 20_000_000, 6);
        Client officer = staff("ada");
        List<Callable<Integer>> jobs = new ArrayList<>();
        for (int i = 0; i < 24; i++) {
            int n = i;
            jobs.add(() -> officer.post("/api/console/loans/" + loanId + "/repayments", Map.of("amount", 250_000, "reference", "PAR-" + loanId + "-" + n)).status());
        }
        try (ExecutorService pool = Executors.newFixedThreadPool(12)) {
            for (Future<Integer> f : pool.invokeAll(jobs)) {
                assertThat(f.get()).isEqualTo(200);
            }
        }
        Map<String, Object> loan = db.sql("select principal_paid + interest_paid + fees_paid as paid from loans where id = ?").param(loanId).query().singleRow();
        assertThat(((Number) loan.get("paid")).longValue()).isEqualTo(24 * 250_000);
        long allocated = db.sql("""
                select sum(a.late_fee + a.interest + a.principal) from allocations a join repayments r on r.id = a.repayment_id where r.loan_id = ?
                """).param(loanId).query(Long.class).single();
        assertThat(allocated).isEqualTo(24 * 250_000);
        long instalmentsPaid = db.sql("select sum(principal_paid + interest_paid) from installments where loan_id = ?").param(loanId).query(Long.class).single();
        assertThat(instalmentsPaid).isEqualTo(24 * 250_000);
    }

    @Test
    void theSameReferenceRetriedInParallelIsAppliedOnce() throws Exception {
        long loanId = activeLoan("reliable", 8_000_000, 3);
        Client officer = staff("ada");
        List<Callable<Long>> jobs = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            jobs.add(() -> officer.post("/api/console/loans/" + loanId + "/repayments", Map.of("amount", 1_000_000, "reference", "DUPLICATE-" + loanId)).ok().get("id").asLong());
        }
        List<Long> ids = new ArrayList<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(10)) {
            for (Future<Long> f : pool.invokeAll(jobs)) {
                ids.add(f.get());
            }
        }
        assertThat(ids).containsOnly(ids.getFirst());
        assertThat(db.sql("select count(*) from repayments where loan_id = ?").param(loanId).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void endOfDayRunsOnceEvenWhenStartedTwice() throws Exception {
        long loanId = activeLoan("declined", 6_000_000, 2);
        LocalDate due = firstDue(loanId);
        List<Callable<EndOfDay.Summary>> jobs = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            jobs.add(() -> endOfDay.run(due));
        }
        try (ExecutorService pool = Executors.newFixedThreadPool(6)) {
            for (Future<EndOfDay.Summary> f : pool.invokeAll(jobs)) {
                f.get();
            }
        }
        assertThat(db.sql("select count(*) from debit_attempts where loan_id = ?").param(loanId).query(Long.class).single()).isEqualTo(1);
        assertThat(endOfDay.summary(due).status()).isEqualTo("DONE");
        db.sql("delete from business_days where business_date = ?").param(due).update();
    }

    @Test
    void historyIsAppendOnlyAndFourEyesIsEnforcedByTheDatabase() {
        long loanId = activeLoan("reliable", 3_000_000, 1);
        staff("ada").post("/api/console/loans/" + loanId + "/repayments", Map.of("amount", 100_000, "reference", "HIST-" + loanId)).ok();
        assertThatThrownBy(() -> db.sql("update audit_events set action = 'X'").update()).isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
        assertThatThrownBy(() -> db.sql("delete from repayments where loan_id = ?").param(loanId).update()).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> db.sql("update loan_events set amount = 0").update()).isInstanceOf(DataAccessException.class);
        long staffId = db.sql("select id from staff where email = 'tunde@credline.ng'").query(Long.class).single();
        assertThatThrownBy(() -> db.sql("update applications set maker_id = ?, checker_id = ?").params(staffId, staffId).update())
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> db.sql("update installments set principal_paid = principal_due + 1").update())
                .isInstanceOf(DataAccessException.class);
    }
}
