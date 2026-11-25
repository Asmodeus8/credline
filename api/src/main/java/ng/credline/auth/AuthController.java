package ng.credline.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.Optional;
import ng.credline.common.Actor;
import ng.credline.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final Sessions sessions;
    private final String dummyHash;

    AuthController(JdbcClient db, PasswordEncoder passwords, Sessions sessions) {
        this.db = db;
        this.passwords = passwords;
        this.sessions = sessions;
        this.dummyHash = passwords.encode(java.util.UUID.randomUUID().toString());
    }

    record StaffLogin(@NotBlank String email, @NotBlank String password) {}

    record BorrowerLogin(@Pattern(regexp = "^0[789][01][0-9]{8}$") String phone, @Pattern(regexp = "^[0-9]{4}$") String pin) {}

    record Me(String type, Long id, String name, String role) {
        static Me of(Actor a) {
            return new Me(a.type().name(), a.id(), a.name(), a.role());
        }
    }

    record Credential(long id, String name, String role, String hash) {}

    @PostMapping("/staff")
    ResponseEntity<Me> staff(@Valid @RequestBody StaffLogin body) {
        Optional<Credential> found = db.sql("select id, name, role, password_hash as hash from staff where lower(email) = lower(?)")
                .param(body.email().trim())
                .query(Credential.class)
                .optional();
        return login(found, body.password(), Actor.Type.STAFF);
    }

    @PostMapping("/borrower")
    ResponseEntity<Me> borrower(@Valid @RequestBody BorrowerLogin body) {
        Optional<Credential> found = db.sql("select id, first_name || ' ' || last_name as name, 'BORROWER' as role, pin_hash as hash from borrowers where phone = ?")
                .param(body.phone())
                .query(Credential.class)
                .optional();
        return login(found, body.pin(), Actor.Type.BORROWER);
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().headers(sessions.clear()).build();
    }

    @GetMapping("/session")
    ResponseEntity<Me> session() {
        return Actor.find().map(a -> ResponseEntity.ok(Me.of(a))).orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    private ResponseEntity<Me> login(Optional<Credential> found, String secret, Actor.Type type) {
        boolean ok = passwords.matches(secret, found.map(Credential::hash).orElse(dummyHash)) && found.isPresent();
        if (!ok) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "Those details don't match our records");
        }
        Credential c = found.get();
        Sessions.Session s = sessions.issue(new Actor(type, c.id(), c.name(), c.role()));
        return ResponseEntity.ok().headers(sessions.cookie(s)).body(Me.of(s.actor()));
    }
}
