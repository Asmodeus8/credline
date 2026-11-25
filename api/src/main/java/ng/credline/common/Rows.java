package ng.credline.common;

import java.sql.Array;
import java.sql.Date;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.postgresql.util.PGobject;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class Rows {

    private final JsonMapper json;

    public Rows(JsonMapper json) {
        this.json = json;
    }

    public List<Map<String, Object>> list(JdbcClient.StatementSpec spec) {
        return spec.query().listOfRows().stream().map(this::convert).toList();
    }

    public Optional<Map<String, Object>> one(JdbcClient.StatementSpec spec) {
        return list(spec).stream().findFirst();
    }

    private Map<String, Object> convert(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(camel(k), value(v)));
        return out;
    }

    private Object value(Object v) {
        try {
            return switch (v) {
                case null -> null;
                case Timestamp t -> t.toInstant();
                case Date d -> d.toLocalDate();
                case Array a -> Arrays.asList((Object[]) a.getArray());
                case PGobject p when p.getType().startsWith("json") -> p.getValue() == null ? null : json.readTree(p.getValue());
                default -> v;
            };
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    static String camel(String snake) {
        StringBuilder b = new StringBuilder(snake.length());
        boolean up = false;
        for (char c : snake.toCharArray()) {
            if (c == '_') {
                up = true;
            } else {
                b.append(up ? Character.toUpperCase(c) : c);
                up = false;
            }
        }
        return b.toString();
    }
}
