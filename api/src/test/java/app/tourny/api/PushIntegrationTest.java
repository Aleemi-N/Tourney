package app.tourny.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.sun.net.httpserver.HttpServer;
import java.math.BigInteger;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Queued push messages reach the Expo endpoint and dead device tokens are forgotten.
 * Uses the local Supabase database (supabase db reset --local) and a fake Expo server.
 */
@SpringBootTest(properties = "tourny.push.interval-ms=200")
class PushIntegrationTest {

    private static final String DB_URL = System.getenv().getOrDefault("TOURNY_TEST_DB_URL", "jdbc:postgresql://127.0.0.1:54322/postgres");
    private static final List<String> received = new CopyOnWriteArrayList<>();
    private static volatile String reply = "{\"data\":[{\"status\":\"ok\",\"id\":\"1\"}]}";
    private static HttpServer expo;
    private static final Map<String, String> webRequests = new ConcurrentHashMap<>();
    private static String subscriptionP256dh;
    private static String subscriptionAuth;

    private static String b64(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }

    /** An uncompressed P-256 public point (65 bytes) and the matching 32-byte private scalar, base64url like browsers and VAPID tools use. */
    private static String[] ecKeys() throws Exception {
        var generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        var pair = generator.generateKeyPair();
        var pub = (ECPublicKey) pair.getPublic();
        byte[] point = new byte[65];
        point[0] = 4;
        System.arraycopy(fixed(pub.getW().getAffineX()), 0, point, 1, 32);
        System.arraycopy(fixed(pub.getW().getAffineY()), 0, point, 33, 32);
        return new String[] { b64(point), b64(fixed(((ECPrivateKey) pair.getPrivate()).getS())) };
    }

    private static byte[] fixed(BigInteger n) {
        byte[] raw = n.toByteArray();
        byte[] out = new byte[32];
        System.arraycopy(raw, Math.max(0, raw.length - 32), out, Math.max(0, 32 - raw.length), Math.min(raw.length, 32));
        return out;
    }

    @DynamicPropertySource
    static void config(DynamicPropertyRegistry registry) throws Exception {
        expo = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        expo.createContext("/push", exchange -> {
            received.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        // A fake browser push service: records what it was sent, and answers 410 Gone for one subscription.
        expo.createContext("/webpush", exchange -> {
            webRequests.put(exchange.getRequestURI().getPath(), exchange.getRequestHeaders().getFirst("Authorization") + "|" + exchange.getRequestHeaders().getFirst("Content-Encoding") + "|" + exchange.getRequestBody().readAllBytes().length);
            exchange.sendResponseHeaders(exchange.getRequestURI().getPath().endsWith("/gone") ? 410 : 201, -1);
            exchange.close();
        });
        expo.start();
        var vapid = ecKeys();
        registry.add("tourny.push.vapid.public-key", () -> vapid[0]);
        registry.add("tourny.push.vapid.private-key", () -> vapid[1]);
        var browser = ecKeys();
        subscriptionP256dh = browser[0];
        var authBytes = new byte[16];
        new SecureRandom().nextBytes(authBytes);
        subscriptionAuth = b64(authBytes);
        registry.add("tourny.push.url", () -> "http://127.0.0.1:" + expo.getAddress().getPort() + "/push");
        registry.add("tourny.jwt.secret", () -> "super-secret-jwt-token-with-at-least-32-characters-long");
        var env = Pattern.compile("NEXT_PUBLIC_SUPABASE_ANON_KEY=\"?([^\"\\s]+)").matcher(Files.readString(Path.of("../.env.local")));
        if (env.find()) registry.add("tourny.postgrest.api-key", () -> env.group(1));
    }

    @BeforeAll
    static void databaseReachable() {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            assumeTrue(c.isValid(2));
        } catch (Exception e) {
            assumeTrue(false, "database not reachable at " + DB_URL + ": " + e);
        }
    }

    @AfterAll
    static void stop() {
        if (expo != null) expo.stop(0);
    }

    private static Object one(Connection c, String sql, Object... args) throws Exception {
        try (var st = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) st.setObject(i + 1, args[i]);
            try (var rs = st.executeQuery()) {
                return rs.next() ? rs.getObject(1) : null;
            }
        }
    }

    @Test
    void matchStartIsPushedAndDeadTokensAreDropped() throws Exception {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            Object owner = one(c, "SELECT o.user_id FROM public.matches m JOIN public.team_owners o ON o.team_id = m.home_team_id AND o.status = 'ACTIVE' WHERE m.status = 'SCHEDULED' AND m.away_team_id IS NOT NULL LIMIT 1");
            assumeTrue(owner != null, "seed has no scheduled match with an owner");
            Object match = one(c, "SELECT m.id FROM public.matches m JOIN public.team_owners o ON o.team_id = m.home_team_id AND o.status = 'ACTIVE' WHERE m.status = 'SCHEDULED' AND m.away_team_id IS NOT NULL AND o.user_id = ? LIMIT 1", owner);
            String token = "ExponentPushToken[test-" + UUID.randomUUID() + "]";
            try (var st = c.prepareStatement("INSERT INTO public.push_tokens (token, user_id, platform) VALUES (?, ?, 'android')")) {
                st.setString(1, token);
                st.setObject(2, owner);
                st.executeUpdate();
            }
            reply = "{\"data\":[{\"status\":\"error\",\"message\":\"gone\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}";
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'LIVE' WHERE id = ?")) {
                st.setObject(1, match);
                st.executeUpdate();
            }

            long deadline = System.currentTimeMillis() + 15_000;
            while (System.currentTimeMillis() < deadline && received.stream().noneMatch(m -> m.contains(token))) Thread.sleep(200);
            String message = received.stream().filter(m -> m.contains(token)).findFirst().orElse("");
            assertTrue(message.contains("Match started"), message);
            assertTrue(message.contains("MATCH_LIVE") && message.contains(match.toString()), message);

            // Expo said the device is gone: the token is deleted and the outbox row is marked sent.
            deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline && one(c, "SELECT 1 FROM public.push_tokens WHERE token = ?", token) != null) Thread.sleep(200);
            assertEquals(null, one(c, "SELECT 1 FROM public.push_tokens WHERE token = ?", token));
            assertEquals(0L, ((Number) one(c, "SELECT count(*) FROM public.push_outbox WHERE sent_at IS NULL AND attempts < 5")).longValue());

            // The apps cannot read tokens or the queue directly.
            assertEquals(Boolean.FALSE, one(c, "SELECT has_table_privilege('authenticated', 'public.push_tokens', 'SELECT') OR has_table_privilege('authenticated', 'public.push_outbox', 'SELECT')"));
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'SCHEDULED' WHERE id = ?")) {
                st.setObject(1, match);
                st.executeUpdate();
            }
        }
    }

    @Test
    void anonymousFollowersGetScheduleStartAndFinalAlerts() throws Exception {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            Object match = one(c, "SELECT id FROM public.matches WHERE status = 'SCHEDULED' AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL AND scheduled_at IS NOT NULL LIMIT 1");
            assumeTrue(match != null, "seed has no scheduled match with a time");
            Object originalTime = one(c, "SELECT scheduled_at FROM public.matches WHERE id = ?", match);
            String token = "ExponentPushToken[follow-" + UUID.randomUUID() + "]";
            reply = "{\"data\":[{\"status\":\"ok\",\"id\":\"1\"}]}";
            // A signed-out device registers and follows through the public functions only.
            try (var st = c.createStatement()) {
                st.execute("SET ROLE anon");
                try (var ps = c.prepareStatement("SELECT public.register_push_token(?, 'android')")) { ps.setString(1, token); ps.execute(); }
                try (var ps = c.prepareStatement("SELECT public.follow_target(?, 'MATCH', ?)")) { ps.setString(1, token); ps.setObject(2, match); ps.execute(); }
                st.execute("RESET ROLE");
            }
            try (var st = c.prepareStatement("UPDATE public.matches SET scheduled_at = scheduled_at + interval '1 hour' WHERE id = ?")) { st.setObject(1, match); st.executeUpdate(); }
            assertTrue(waitFor(token, "Match rescheduled"), "schedule change alert");
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'LIVE' WHERE id = ?")) { st.setObject(1, match); st.executeUpdate(); }
            assertTrue(waitFor(token, "Match started"), "start alert");
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'COMPLETED' WHERE id = ?")) { st.setObject(1, match); st.executeUpdate(); }
            assertTrue(waitFor(token, "Final result"), "final alert");
            // Someone who does not follow it hears nothing, and the device can forget everything.
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'SCHEDULED', scheduled_at = ? WHERE id = ?")) { st.setObject(1, originalTime); st.setObject(2, match); st.executeUpdate(); }
            try (var st = c.createStatement()) {
                st.execute("SET ROLE anon");
                try (var ps = c.prepareStatement("SELECT public.forget_push_device(?)")) { ps.setString(1, token); ps.execute(); }
                st.execute("RESET ROLE");
            }
            assertEquals(null, one(c, "SELECT 1 FROM public.push_tokens WHERE token = ?", token));
            assertEquals(null, one(c, "SELECT 1 FROM public.push_follows WHERE token = ?", token));
        }
    }

    @Test
    void browsersGetEncryptedWebPushAndGoneSubscriptionsAreForgotten() throws Exception {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            Object match = one(c, "SELECT id FROM public.matches WHERE status = 'SCHEDULED' AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL LIMIT 1");
            assumeTrue(match != null, "seed has no scheduled match");
            String base = "http://127.0.0.1:" + expo.getAddress().getPort() + "/webpush/";
            String live = base + "live-" + UUID.randomUUID();
            String gone = base + "gone";
            reply = "{\"data\":[]}";
            for (String endpoint : new String[] { live, gone }) {
                try (var st = c.prepareStatement("INSERT INTO public.push_tokens (token, user_id, platform, p256dh, auth_secret) VALUES (?, NULL, 'web', ?, ?)")) {
                    st.setString(1, endpoint); st.setString(2, subscriptionP256dh); st.setString(3, subscriptionAuth); st.executeUpdate();
                }
                try (var st = c.prepareStatement("INSERT INTO public.push_follows (token, kind, target_id) VALUES (?, 'MATCH', ?)")) {
                    st.setString(1, endpoint); st.setObject(2, match); st.executeUpdate();
                }
            }
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'LIVE' WHERE id = ?")) { st.setObject(1, match); st.executeUpdate(); }
            String livePath = java.net.URI.create(live).getPath();
            long deadline = System.currentTimeMillis() + 15_000;
            while (System.currentTimeMillis() < deadline && !webRequests.containsKey(livePath)) Thread.sleep(200);
            String seen = webRequests.get(livePath);
            assertTrue(seen != null && seen.startsWith("vapid "), "VAPID-signed request, got " + seen);
            assertTrue(seen.contains("aes128gcm"), "payload is encrypted, got " + seen);
            deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline && one(c, "SELECT 1 FROM public.push_tokens WHERE token = ?", gone) != null) Thread.sleep(200);
            assertEquals(null, one(c, "SELECT 1 FROM public.push_tokens WHERE token = ?", gone), "a 410 Gone subscription is forgotten");
            assertTrue(one(c, "SELECT 1 FROM public.push_tokens WHERE token = ?", live) != null);
            try (var st = c.prepareStatement("UPDATE public.matches SET status = 'SCHEDULED' WHERE id = ?")) { st.setObject(1, match); st.executeUpdate(); }
            try (var st = c.prepareStatement("DELETE FROM public.push_tokens WHERE token = ?")) { st.setString(1, live); st.executeUpdate(); }
        }
    }

    private static boolean waitFor(String token, String text) throws Exception {
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline) {
            if (received.stream().anyMatch(m -> m.contains(token) && m.contains(text))) return true;
            Thread.sleep(200);
        }
        return false;
    }
}
