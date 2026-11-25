package ng.credline;

import java.time.Duration;
import java.time.ZoneId;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("credline")
public record CredlineProperties(ZoneId zone, Auth auth, Payments payments, Collections collections, Policy policy, Seed seed) {

    public record Auth(String secret, Duration ttl, boolean secureCookie) {}

    public record Payments(String provider, String paystackSecret, String callbackUrl, String publicUrl) {
        public boolean sandbox() {
            return !"paystack".equalsIgnoreCase(provider);
        }
    }

    public record Collections(String cron, List<Integer> retryDays, int graceDays) {}

    public record Policy(long makerCheckerThreshold, long firstLoanCap, Duration offerTtl) {}

    public record Seed(boolean staff) {}
}
