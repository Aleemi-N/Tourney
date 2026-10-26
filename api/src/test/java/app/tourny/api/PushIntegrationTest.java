package app.tourny.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.sun.net.httpserver.HttpServer;
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
        expo.start();
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
}
