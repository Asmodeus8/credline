package ng.credline.common;

import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

public record Actor(Type type, Long id, String name, String role) {

    public enum Type { STAFF, BORROWER, SYSTEM }

    public static final Actor SYSTEM = new Actor(Type.SYSTEM, null, "Credline", "SYSTEM");

    public static Actor current() {
        return find().orElseThrow(() -> ApiException.forbidden("UNAUTHENTICATED", "Sign in first"));
    }

    public static Optional<Actor> find() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
            return Optional.empty();
        }
        String[] sub = jwt.getSubject().split(":", 2);
        return Optional.of(new Actor(Type.valueOf(sub[0].toUpperCase()), Long.parseLong(sub[1]),
                jwt.getClaimAsString("name"), jwt.getClaimAsString("role")));
    }

    public boolean isManager() {
        return type == Type.STAFF && "MANAGER".equals(role);
    }

    public long staffId() {
        if (type != Type.STAFF) {
            throw ApiException.forbidden("STAFF_ONLY", "Staff only");
        }
        return id;
    }

    public long borrowerId() {
        if (type != Type.BORROWER) {
            throw ApiException.forbidden("BORROWER_ONLY", "Borrowers only");
        }
        return id;
    }
}
