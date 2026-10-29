package app.tourny.api.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * Accounts and sessions: short-lived access
 * tokens (JWT, subject = user id) and rotating opaque refresh tokens. Users live in auth.users with
 * their existing bcrypt hashes.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    public static class AuthException extends RuntimeException {
        public final int status;
        public final String code;

        AuthException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code;
        }
    }

    private static final Duration REFRESH_TTL = Duration.ofDays(30);
    // A token that was just rotated may arrive again within seconds (two tabs, or the website's proxy and the browser, renewing
    // together). That is not theft; only a later replay is.
    private static final Duration ROTATION_GRACE = Duration.ofSeconds(10);
    private static final Duration FAILURE_WINDOW = Duration.ofMinutes(15);
    private static final int MAX_FAILURES_PER_EMAIL = 10;
    private static final int MAX_FAILURES_PER_IP = 30;
    private static final Duration HOUR = Duration.ofHours(1);
    private static final int MIN_PASSWORD = 8;
    private static final int MAX_PASSWORD_BYTES = 72; // what bcrypt reads
    private static final java.util.regex.Pattern EMAIL = java.util.regex.Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final JwtEncoder jwtEncoder;
    private final ObjectMapper mapper;
    private final long ttlSeconds;
    private final String dummyHash;
    private final SecureRandom random = new SecureRandom();
    private final RecoveryMailer mailer;
    private final List<String> siteOrigins;
    private final RateLimiter limits;
    // Sending mail takes far longer than not sending it; doing it off the request keeps the answer the same speed for every email.
    private final ExecutorService mailQueue = Executors.newSingleThreadExecutor(r -> { var t = new Thread(r, "recovery-mail"); t.setDaemon(true); return t; });

    AuthService(JdbcClient jdbc, PasswordEncoder encoder, JwtEncoder jwtEncoder, ObjectMapper mapper, RecoveryMailer mailer, RateLimiter limits,
                @Value("${tourny.cors.origins:}") List<String> siteOrigins,
                @Value("${tourny.jwt.ttl-seconds}") long ttlSeconds) {
        this.mailer = mailer;
        this.limits = limits;
        this.siteOrigins = siteOrigins.stream().map(String::trim).filter(o -> !o.isEmpty()).toList();
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.jwtEncoder = jwtEncoder;
        this.mapper = mapper;
        this.ttlSeconds = ttlSeconds;
        this.dummyHash = encoder.encode("not-a-real-password"); // unknown emails cost the same as wrong passwords
    }

    @Transactional
    public Map<String, Object> signInWithPassword(String email, String password, String ip) {
        String key = email.trim().toLowerCase();
        if (limits.exceeded("login-email", key, MAX_FAILURES_PER_EMAIL, FAILURE_WINDOW) || limits.exceeded("login-ip", ip, MAX_FAILURES_PER_IP, FAILURE_WINDOW)) {
            throw new AuthException(429, "over_request_rate_limit", "Too many sign-in attempts. Try again later.");
        }
        Optional<Map<String, Object>> row = findUser("lower(email) = :v", key);
        String hash = row.map(r -> (String) r.get("encrypted_password")).orElse(null);
        boolean ok = password.getBytes(StandardCharsets.UTF_8).length <= MAX_PASSWORD_BYTES && encoder.matches(password, hash == null ? dummyHash : hash);
        if (row.isEmpty() || hash == null || !ok) {
            limits.record("login-email", key);
            limits.record("login-ip", ip);
            throw new AuthException(400, "invalid_credentials", "Invalid login credentials");
        }
        limits.clear("login-email", key);
        return session(row.get());
    }

    // The reuse check revokes sessions and then throws; that revocation must be kept.
    @Transactional(noRollbackFor = AuthException.class)
    public Map<String, Object> refresh(String refreshToken) {
        String hash = sha256(refreshToken);
        Optional<Map<String, Object>> stored = jdbc.sql("SELECT id, user_id::text AS user_id, expires_at, revoked_at FROM public.api_refresh_tokens WHERE token_hash = :h FOR UPDATE")
                .param("h", hash).query().listOfRows().stream().findFirst();
        if (stored.isEmpty()) throw new AuthException(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        String userId = (String) stored.get().get("user_id");
        var revokedAt = (java.sql.Timestamp) stored.get().get("revoked_at");
        if (revokedAt != null && revokedAt.toInstant().isBefore(Instant.now().minus(ROTATION_GRACE))) {
            // A token that was rotated (or ended by sign-out) came back later: assume it leaked and end every session of this user.
            revokeAll(userId);
            throw new AuthException(400, "refresh_token_already_used", "Invalid Refresh Token: Already Used");
        }
        if (((java.sql.Timestamp) stored.get().get("expires_at")).toInstant().isBefore(Instant.now())) {
            throw new AuthException(400, "refresh_token_not_found", "Invalid Refresh Token: expired");
        }
        jdbc.sql("UPDATE public.api_refresh_tokens SET revoked_at = now() WHERE token_hash = :h AND revoked_at IS NULL").param("h", hash).update(); // the first renewal sets the time the grace counts from
        return session(findUser("id = :v::uuid", userId).orElseThrow(() -> new AuthException(400, "user_not_found", "User not found")));
    }

    @Transactional
    public Map<String, Object> signUp(String email, String password, Map<String, Object> metadata, String ip) {
        // Account creation is open, so cap it per address: 20 accounts per hour is far above any real use.
        if (limits.exceeded("signup-ip", ip, 20, HOUR)) throw new AuthException(429, "over_request_rate_limit", "Too many sign-ups from this address. Try again later.");
        limits.record("signup-ip", ip);
        String normalized = email.trim().toLowerCase();
        if (normalized.length() > 254 || !EMAIL.matcher(normalized).matches()) throw new AuthException(422, "validation_failed", "Enter a valid email address.");
        checkPassword(password);
        if (findUser("lower(email) = :v", normalized).isPresent()) throw new AuthException(422, "user_already_exists", "User already registered");
        String id = UUID.randomUUID().toString();
        try {
            jdbc.sql("""
                    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
                    VALUES (:id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :email, :hash, now(),
                            '{"provider":"email","providers":["email"]}'::jsonb, :meta::jsonb, now(), now())
                    """).param("id", id).param("email", normalized).param("hash", encoder.encode(password))
                    .param("meta", mapper.writeValueAsString(metadata == null ? Map.of() : metadata)).update();
        } catch (DuplicateKeyException e) {
            throw new AuthException(422, "user_already_exists", "User already registered");
        }
        return session(findUser("id = :v::uuid", id).orElseThrow());
    }

    /**
     * Starts a password reset. The response never reveals whether the email has an account. The link
     * goes to a site origin we know (redirect_to is checked against tourny.cors.origins) and carries a
     * one-time code that only the browser holding the PKCE verifier can exchange.
     */
    @Transactional
    public void recover(String email, String codeChallenge, String method, String redirectTo, String ip) {
        // Only the S256 form of PKCE: with "plain" the challenge is the verifier, and the email link would be enough to redeem the code.
        if (codeChallenge == null || codeChallenge.isBlank() || (method != null && !"s256".equalsIgnoreCase(method))) {
            throw new AuthException(400, "validation_failed", "A PKCE code_challenge with method s256 is required");
        }
        String key = email.trim().toLowerCase();
        if (limits.exceeded("recover-email", key, 3, HOUR) || limits.exceeded("recover-ip", ip, 10, HOUR)) {
            throw new AuthException(429, "over_email_send_rate_limit", "Too many reset requests. Try again later.");
        }
        limits.record("recover-email", key);
        limits.record("recover-ip", ip);

        Optional<Map<String, Object>> user = findUser("lower(email) = :v", key);
        if (user.isEmpty() || siteOrigins.isEmpty()) return;

        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        jdbc.sql("INSERT INTO public.api_auth_codes (user_id, code_hash, code_challenge, code_challenge_method, expires_at) VALUES (:u::uuid, :h, :c, 's256', :e)")
                .param("u", user.get().get("id")).param("h", sha256(code)).param("c", codeChallenge)
                .param("e", java.sql.Timestamp.from(Instant.now().plus(Duration.ofHours(1)))).update();
        String base = safeRedirect(redirectTo);
        String link = base + (base.contains("?") ? "&" : "?") + "code=" + code;
        mailQueue.execute(() -> {
            try {
                mailer.sendRecoveryLink(key, link);
            } catch (RuntimeException e) {
                log.warn("Could not send a password recovery email: {}", e.toString());
            }
        });
    }

    /** Completes the PKCE exchange: the code from the email plus the verifier gives a session. */
    @Transactional(noRollbackFor = AuthException.class)
    public Map<String, Object> exchangeCode(String code, String verifier) {
        Optional<Map<String, Object>> row = jdbc.sql("SELECT id, user_id::text AS user_id, code_challenge, code_challenge_method, expires_at, used_at FROM public.api_auth_codes WHERE code_hash = :h FOR UPDATE")
                .param("h", sha256(code)).query().listOfRows().stream().findFirst();
        if (row.isEmpty() || row.get().get("used_at") != null
                || ((java.sql.Timestamp) row.get().get("expires_at")).toInstant().isBefore(Instant.now())) {
            throw new AuthException(400, "flow_state_not_found", "Invalid or expired code");
        }
        jdbc.sql("UPDATE public.api_auth_codes SET used_at = now() WHERE id = :i").param("i", row.get().get("id")).update(); // single use, even if the verifier is wrong
        String expected = (String) row.get().get("code_challenge");
        String actual = Base64.getUrlEncoder().withoutPadding().encodeToString(sha256Bytes(verifier));
        if (!java.security.MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8))) {
            throw new AuthException(400, "bad_code_verifier", "Invalid code verifier");
        }
        return session(findUser("id = :v::uuid", (String) row.get().get("user_id")).orElseThrow(() -> new AuthException(400, "user_not_found", "User not found")));
    }

    private String safeRedirect(String redirectTo) {
        if (redirectTo != null) {
            for (String origin : siteOrigins) {
                if (redirectTo.equals(origin) || redirectTo.startsWith(origin + "/")) return redirectTo;
            }
        }
        return siteOrigins.get(0) + "/auth/callback";
    }

    @Transactional
    public void signOut(String userId) {
        revokeAll(userId);
    }

    /** Ends every session of the user. Dated before the rotation grace, so none of these tokens can be renewed again. */
    private void revokeAll(String userId) {
        jdbc.sql("UPDATE public.api_refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE user_id = :u::uuid AND revoked_at IS NULL").param("u", userId).update();
    }

    private static void checkPassword(String password) {
        if (password.length() < MIN_PASSWORD) throw new AuthException(422, "weak_password", "Password should be at least " + MIN_PASSWORD + " characters.");
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) throw new AuthException(422, "weak_password", "Password is too long (at most " + MAX_PASSWORD_BYTES + " bytes).");
    }

    @Transactional
    public Map<String, Object> updateUser(String userId, String password, Map<String, Object> metadata) {
        if (password != null) {
            checkPassword(password);
            jdbc.sql("UPDATE auth.users SET encrypted_password = :h, updated_at = now() WHERE id = :u::uuid").param("h", encoder.encode(password)).param("u", userId).update();
            revokeAll(userId); // whoever held an old session must sign in again with the new password (this session's access token lasts out its hour)
        }
        if (metadata != null) {
            jdbc.sql("UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || :m::jsonb, updated_at = now() WHERE id = :u::uuid")
                    .param("m", mapper.writeValueAsString(metadata)).param("u", userId).update();
        }
        return user(findUser("id = :v::uuid", userId).orElseThrow(() -> new AuthException(404, "user_not_found", "User not found")));
    }

    public Map<String, Object> getUser(String userId) {
        return user(findUser("id = :v::uuid", userId).orElseThrow(() -> new AuthException(401, "user_not_found", "User from sub claim in JWT does not exist")));
    }

    // -- internals ----------------------------------------------------------------------------

    private Optional<Map<String, Object>> findUser(String where, String value) {
        return jdbc.sql("SELECT id::text AS id, email, encrypted_password, email_confirmed_at, created_at, updated_at, last_sign_in_at, banned_until, "
                        + "raw_app_meta_data::text AS app_meta, raw_user_meta_data::text AS user_meta FROM auth.users WHERE deleted_at IS NULL AND " + where)
                .param("v", value).query().listOfRows().stream().findFirst();
    }

    private Map<String, Object> session(Map<String, Object> user) {
        var banned = (java.sql.Timestamp) user.get("banned_until");
        if (banned != null && banned.toInstant().isAfter(Instant.now())) throw new AuthException(400, "user_banned", "User is banned");
        String userId = (String) user.get("id");
        // A suspended organizer (profiles.status) cannot start or renew a session.
        boolean suspended = jdbc.sql("SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = :u::uuid AND status = 'SUSPENDED')")
                .param("u", userId).query(Boolean.class).single();
        if (suspended) throw new AuthException(400, "user_banned", "User is banned");
        jdbc.sql("UPDATE auth.users SET last_sign_in_at = now() WHERE id = :u::uuid").param("u", userId).update();

        Instant now = Instant.now();
        Instant expires = now.plusSeconds(ttlSeconds);
        Object appMeta = parse((String) user.get("app_meta"));
        Object userMeta = parse((String) user.get("user_meta"));
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(userId).audience(List.of("authenticated")).issuedAt(now).expiresAt(expires)
                .claim("role", "authenticated").claim("email", user.get("email")).claim("app_metadata", appMeta).claim("user_metadata", userMeta)
                .claim("session_id", UUID.randomUUID().toString()).build();
        String access = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();

        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String refresh = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        jdbc.sql("INSERT INTO public.api_refresh_tokens (user_id, token_hash, expires_at) VALUES (:u::uuid, :h, :e)")
                .param("u", userId).param("h", sha256(refresh)).param("e", java.sql.Timestamp.from(now.plus(REFRESH_TTL))).update();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("access_token", access);
        out.put("token_type", "bearer");
        out.put("expires_in", ttlSeconds);
        out.put("expires_at", expires.getEpochSecond());
        out.put("refresh_token", refresh);
        out.put("user", user(user));
        return out;
    }

    private Map<String, Object> user(Map<String, Object> row) {
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("id", row.get("id"));
        u.put("aud", "authenticated");
        u.put("role", "authenticated");
        u.put("email", row.get("email"));
        u.put("email_confirmed_at", iso(row.get("email_confirmed_at")));
        u.put("phone", "");
        u.put("last_sign_in_at", iso(row.get("last_sign_in_at")));
        u.put("app_metadata", parse((String) row.get("app_meta")));
        u.put("user_metadata", parse((String) row.get("user_meta")));
        u.put("identities", List.of());
        u.put("created_at", iso(row.get("created_at")));
        u.put("updated_at", iso(row.get("updated_at")));
        return u;
    }

    private static String iso(Object timestamp) {
        return timestamp instanceof java.sql.Timestamp t ? t.toInstant().toString() : null;
    }

    private Object parse(String json) {
        return json == null ? Map.of() : mapper.readValue(json, Object.class);
    }

    private static byte[] sha256Bytes(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
