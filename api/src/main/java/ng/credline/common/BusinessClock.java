package ng.credline.common;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicInteger;
import ng.credline.CredlineProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class BusinessClock {

    private final Clock base;
    private final ZoneId zone;
    private final JdbcClient db;
    private final boolean sandbox;
    private final AtomicInteger offsetDays = new AtomicInteger(-1);

    public BusinessClock(Clock base, CredlineProperties props, JdbcClient db) {
        this.base = base;
        this.zone = props.zone();
        this.db = db;
        this.sandbox = props.payments().sandbox();
    }

    public ZoneId zone() {
        return zone;
    }

    public Instant now() {
        return base.instant().plus(Duration.ofDays(offset()));
    }

    public LocalDate today() {
        return LocalDate.ofInstant(now(), zone);
    }

    public int offset() {
        if (!sandbox) {
            return 0;
        }
        int cached = offsetDays.get();
        if (cached >= 0) {
            return cached;
        }
        int stored = db.sql("select offset_days from sandbox_clock where id = 1").query(Integer.class).single();
        offsetDays.compareAndSet(-1, stored);
        return offsetDays.get();
    }

    public void reload() {
        offsetDays.set(-1);
    }
}
