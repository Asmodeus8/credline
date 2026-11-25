package ng.credline.auth;

import java.time.Duration;
import java.time.Instant;
import ng.credline.CredlineProperties;
import ng.credline.common.Actor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

@Component
public class Sessions {

    private final JwtEncoder encoder;
    private final Duration ttl;
    private final boolean secure;

    public Sessions(JwtEncoder encoder, CredlineProperties props) {
        this.encoder = encoder;
        this.ttl = props.auth().ttl();
        this.secure = props.auth().secureCookie();
    }

    public record Session(String token, Actor actor) {}

    public Session issue(Actor actor) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("credline")
                .subject(actor.type().name().toLowerCase() + ":" + actor.id())
                .claim("name", actor.name())
                .claim("role", actor.role())
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new Session(token, actor);
    }

    public HttpHeaders cookie(Session session) {
        return cookie(session.token(), ttl);
    }

    public HttpHeaders clear() {
        return cookie("", Duration.ZERO);
    }

    private HttpHeaders cookie(String value, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(SecurityConfig.COOKIE, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path("/")
                .maxAge(maxAge)
                .build();
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.SET_COOKIE, cookie.toString());
        return headers;
    }
}
