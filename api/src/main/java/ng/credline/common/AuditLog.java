package ng.credline.common;

import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class AuditLog {

    private final JdbcClient db;
    private final JsonMapper json;
    private final BusinessClock clock;

    public AuditLog(JdbcClient db, JsonMapper json, BusinessClock clock) {
        this.db = db;
        this.json = json;
        this.clock = clock;
    }

    public void record(Actor actor, String action, String entity, long entityId, Map<String, ?> detail) {
        db.sql("""
                insert into audit_events (actor_type, actor_id, actor_name, action, entity, entity_id, detail, at)
                values (?, ?, ?, ?, ?, ?, ?::jsonb, ?)
                """)
                .params(actor.type().name(), actor.id(), actor.name(), action, entity, entityId, json(detail),
                        java.sql.Timestamp.from(clock.now()))
                .update();
    }

    public String json(Object value) {
        return json.writeValueAsString(value);
    }
}
