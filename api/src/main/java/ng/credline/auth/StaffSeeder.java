package ng.credline.auth;

import ng.credline.CredlineProperties;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
class StaffSeeder implements ApplicationRunner {

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final boolean enabled;

    StaffSeeder(JdbcClient db, PasswordEncoder passwords, CredlineProperties props) {
        this.db = db;
        this.passwords = passwords;
        this.enabled = props.seed().staff();
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        seed("ada@credline.ng", "Ada Okafor", "OFFICER");
        seed("kunle@credline.ng", "Kunle Adeyemi", "OFFICER");
        seed("tunde@credline.ng", "Tunde Bakare", "MANAGER");
    }

    private void seed(String email, String name, String role) {
        db.sql("insert into staff (email, name, role, password_hash) values (?, ?, ?, ?) on conflict (email) do nothing")
                .params(email, name, role, passwords.encode("credline-demo"))
                .update();
    }
}
