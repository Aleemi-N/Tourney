package app.tourny.api.security;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Local development only (profile "dev", never active on the server): keeps the latest password-recovery link per email in memory
 * and serves it at GET /dev/recovery-link?email=..., so the whole reset flow can be tried and tested without an SMTP server.
 */
@Profile("dev")
@Configuration
class DevRecovery {

    private static final Map<String, String> LINKS = new ConcurrentHashMap<>();

    @Bean
    @Primary
    RecoveryMailer devMailer() {
        return (email, link) -> LINKS.put(email.toLowerCase(), link);
    }

    @Bean
    @Order(0)
    SecurityFilterChain devChain(HttpSecurity http) throws Exception {
        return http.securityMatcher("/dev/**").cors(Customizer.withDefaults()).csrf(csrf -> csrf.disable()).authorizeHttpRequests(a -> a.anyRequest().permitAll()).build();
    }

    @RestController
    static class Links {
        @GetMapping("/dev/recovery-link")
        ResponseEntity<String> link(@RequestParam String email) {
            String link = LINKS.get(email.toLowerCase());
            return link == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(link);
        }
    }
}
