package app.tourny.api.security;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Logs in against the existing users table (bcrypt hashes are kept as they are) and issues an
 * access token whose subject is the user id, the same id Postgres policies see as auth.uid().
 */
@RestController
class AuthController {

    record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final JwtEncoder jwtEncoder;
    private final long ttlSeconds;

    AuthController(JdbcClient jdbc, PasswordEncoder encoder, JwtEncoder jwtEncoder,
                   @Value("${tourny.jwt.ttl-seconds}") long ttlSeconds) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.jwtEncoder = jwtEncoder;
        this.ttlSeconds = ttlSeconds;
        this.dummyHash = encoder.encode("not-a-real-password");
    }

    // Matches a hash that never verifies, so unknown emails cost the same as wrong passwords.
    private final String dummyHash;

    @PostMapping("/auth/login")
    Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        List<Map<String, Object>> rows = jdbc.sql(
                "SELECT id::text AS id, encrypted_password FROM auth.users WHERE lower(email) = :email AND deleted_at IS NULL")
                .param("email", email).query().listOfRows();
        String hash = rows.isEmpty() ? dummyHash : (String) rows.get(0).get("encrypted_password");
        boolean ok = encoder.matches(request.password(), hash == null ? dummyHash : hash);
        if (rows.isEmpty() || !ok) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        String userId = (String) rows.get(0).get("id");

        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(userId).issuedAt(now).expiresAt(now.plus(Duration.ofSeconds(ttlSeconds)))
                .claim("role", "authenticated").build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return Map.of("access_token", token, "token_type", "Bearer", "expires_in", ttlSeconds,
                "user", Map.of("id", userId, "email", email));
    }
}
