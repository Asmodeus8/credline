package ng.credline.auth;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import ng.credline.CredlineProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.util.WebUtils;

@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    static final String COOKIE = "credline_session";

    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();
        BearerTokenResolver resolver = request -> {
            String token = header.resolve(request);
            if (token != null) {
                return token;
            }
            String path = request.getRequestURI();
            boolean needsSession = path.startsWith("/api/me") || path.startsWith("/api/console") || path.equals("/api/auth/session")
                    || (path.startsWith("/api/sandbox") && !path.startsWith("/api/sandbox/checkout"));
            if (!needsSession) {
                return null;
            }
            var cookie = WebUtils.getCookie(request, COOKIE);
            return cookie == null || cookie.getValue().isBlank() ? null : cookie.getValue();
        };
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> List.of(new SimpleGrantedAuthority("ROLE_" + jwt.getClaimAsString("role"))));
        http
                .csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/**", "/api/products", "/api/quote", "/api/webhooks/**",
                                "/api/sandbox/checkout/**", "/api/docs/**", "/actuator/health/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/applications").permitAll()
                        .requestMatchers("/api/me/**").hasRole("BORROWER")
                        .requestMatchers("/api/console/**", "/api/sandbox/**").hasAnyRole("OFFICER", "MANAGER")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o
                        .bearerTokenResolver(resolver)
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                        .jwt(j -> j.jwtAuthenticationConverter(converter)));
        return http.build();
    }

    @Bean
    SecretKey signingKey(CredlineProperties props) {
        byte[] bytes = props.auth().secret().getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("credline.auth.secret must be at least 32 bytes");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
