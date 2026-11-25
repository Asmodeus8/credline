package ng.credline.origination;

import java.util.Map;
import ng.credline.common.ApiException;
import ng.credline.common.Rows;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class ApplicationViews {

    private final JdbcClient db;
    private final Rows rows;

    public ApplicationViews(JdbcClient db, Rows rows) {
        this.db = db;
        this.rows = rows;
    }

    public Map<String, Object> detail(long appId, Long borrowerId, boolean staffView) {
        Map<String, Object> app = rows.one(db.sql("""
                select a.id, a.reference, a.status, a.amount, a.tenor_months, a.purpose, a.offer_amount, a.offer_tenor,
                       a.offer_expires_at, a.review_note, a.created_at, a.updated_at,
                       p.code as product_code, p.name as product_name, p.monthly_rate_bps, p.fee_bps, p.late_fee_bps,
                       b.id as borrower_id, b.first_name || ' ' || b.last_name as borrower_name, b.phone, b.employment, b.employer,
                       b.monthly_income, b.date_of_birth, b.bank_code, b.account_number,
                       mk.name as maker_name, ck.name as checker_name,
                       l.id as loan_id, l.reference as loan_reference, l.status as loan_status
                from applications a
                join products p on p.code = a.product_code
                join borrowers b on b.id = a.borrower_id
                left join staff mk on mk.id = a.maker_id
                left join staff ck on ck.id = a.checker_id
                left join loans l on l.application_id = a.id
                where a.id = ? and (cast(? as bigint) is null or a.borrower_id = ?)
                """).params(appId, borrowerId, borrowerId)).orElseThrow(() -> ApiException.notFound("Application"));
        Map<String, Object> decision = rows.one(db.sql("""
                select policy_version, outcome, score, reasons, offer_amount, offer_tenor, breakdown, created_at
                from decisions where application_id = ?
                """).param(appId)).orElse(null);
        if (decision != null && !staffView) {
            decision.remove("breakdown");
            decision.remove("score");
        }
        app.put("decision", decision);
        if (staffView) {
            app.put("bureau", rows.one(db.sql("""
                    select bureau, hit, score, active_facilities, delinquent_facilities, monthly_obligations, pulled_at
                    from credit_reports where application_id = ?
                    """).param(appId)).orElse(null));
            app.put("audit", rows.list(db.sql("""
                    select id, actor_type, actor_name, action, detail, at from audit_events
                    where entity = 'application' and entity_id = ? order by id
                    """).param(appId)));
        } else {
            app.remove("bankCode");
            app.remove("reviewNote");
        }
        return app;
    }
}
