package app.tourny.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Registration fees end to end against the local database and a fake Razorpay: connecting an organizer's keys (stored
 * encrypted), paying through a hosted link, reading the result back, the approval rule, and refunds.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = { "tourny.payments.reconcile-ms=600000", "tourny.push.enabled=false" })
class PaymentIntegrationTest {

    private static final String DB_URL = System.getenv().getOrDefault("TOURNY_TEST_DB_URL", "jdbc:postgresql://127.0.0.1:5440/tourny");
    private static final String T1 = "90200000-0000-0000-0000-000000000001";
    private static final String GOOD_ID = "rzp_test_AbCdEf123456";
    private static final String GOOD_SECRET = "SecretValue1234567890";
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final List<String> created = new CopyOnWriteArrayList<>();
    private static final List<String> refunds = new CopyOnWriteArrayList<>();
    private static final Map<String, String> linkStatus = new ConcurrentHashMap<>();
    private static HttpServer razorpay;
    private static String password;

    @LocalServerPort
    int port;

    @DynamicPropertySource
    static void config(DynamicPropertyRegistry registry) throws Exception {
        razorpay = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        razorpay.createContext("/v1", exchange -> {
            String auth = exchange.getRequestHeaders().getFirst("Authorization");
            String expected = "Basic " + Base64.getEncoder().encodeToString((GOOD_ID + ":" + GOOD_SECRET).getBytes(StandardCharsets.UTF_8));
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String reply;
            int status = 200;
            if (!expected.equals(auth)) {
                status = 401;
                reply = "{\"error\":{\"description\":\"Authentication failed\"}}";
            } else if (path.equals("/v1/payment_links") && method.equals("GET")) {
                reply = "{\"items\":[]}";
            } else if (path.equals("/v1/payment_links") && method.equals("POST")) {
                created.add(body);
                String id = "plink_" + created.size();
                linkStatus.put(id, "created");
                reply = "{\"id\":\"" + id + "\",\"short_url\":\"https://rzp.io/i/" + id + "\",\"status\":\"created\"}";
            } else if (path.startsWith("/v1/payment_links/") && method.equals("GET")) {
                String id = path.substring("/v1/payment_links/".length());
                String s = linkStatus.getOrDefault(id, "created");
                reply = "{\"id\":\"" + id + "\",\"status\":\"" + s + "\",\"payments\":" + ("paid".equals(s) ? "[{\"payment_id\":\"pay_" + id + "\"}]" : "null") + "}";
            } else if (path.matches("/v1/payments/[^/]+/refund") && method.equals("POST")) {
                refunds.add(path + "|" + body);
                reply = "{\"id\":\"rfnd_1\"}";
            } else {
                status = 404;
                reply = "{\"error\":{\"description\":\"not found\"}}";
            }
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        razorpay.start();
        registry.add("tourny.razorpay.base-url", () -> "http://127.0.0.1:" + razorpay.getAddress().getPort() + "/v1");
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("tourny.secrets.key", () -> Base64.getEncoder().encodeToString(key));
        registry.add("tourny.site-url", () -> "https://app.example.test");
        registry.add("tourny.jwt.secret", () -> "dev-only-jwt-secret-0123456789-0123456789");
    }

    @BeforeAll
    static void seeded() throws Exception {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            assumeTrue(c.isValid(2));
            c.createStatement().execute("DELETE FROM public.api_rate_events"); // limits from earlier runs must not count here
        } catch (Exception e) {
            assumeTrue(false, "database not reachable at " + DB_URL + ": " + e);
        }
        var m = Pattern.compile("extensions\\.crypt\\('([^']+)'").matcher(Files.readString(Path.of("../db/seed.sql")));
        assertTrue(m.find());
        password = m.group(1);
    }

    @AfterAll
    static void stop() {
        if (razorpay != null) razorpay.stop(0);
    }

    private HttpResponse<String> send(String method, String path, String json, String token) throws Exception {
        var b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).header("Content-Type", "application/json")
                .method(method, json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json));
        if (token != null) b.header("Authorization", "Bearer " + token);
        return HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String login(String email) throws Exception {
        var r = send("POST", "/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", null);
        var m = Pattern.compile("\"access_token\":\"([^\"]+)\"").matcher(r.body());
        assertTrue(m.find(), r.body());
        return m.group(1);
    }

    private static Object one(Connection c, String sql, Object... args) throws Exception {
        try (var st = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) st.setObject(i + 1, args[i]);
            try (var rs = st.executeQuery()) {
                return rs.next() ? rs.getObject(1) : null;
            }
        }
    }

    private static void exec(Connection c, String sql, Object... args) throws Exception {
        try (var st = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) st.setObject(i + 1, args[i]);
            st.executeUpdate();
        }
    }

    @Test
    void organizersConnectRazorpayPlayersPayAndTheApprovalRuleFollows() throws Exception {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            // A pending player registration and its owner.
            var reg = c.createStatement().executeQuery("SELECT r.id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id JOIN auth.users u ON u.id = pp.user_id WHERE r.tournament_id = '" + T1 + "' AND r.status = 'PENDING' ORDER BY r.created_at LIMIT 2");
            assertTrue(reg.next());
            String regId = reg.getString(1), payerEmail = reg.getString(2);
            String otherEmail = reg.next() ? reg.getString(2) : null;
            assumeTrue(otherEmail != null, "needs two pending registrations");
            exec(c, "UPDATE public.tournament_settings SET player_registration_fee = 250 WHERE tournament_id = ?::uuid", T1);
            try {
                String organizer = login("organizer@tourny.local");
                String payer = login(payerEmail);
                String other = login(otherEmail);
                String account = "/payments/tournaments/" + T1 + "/account";

                // Connecting: organizers only, valid-looking keys only, keys Razorpay accepts.
                assertEquals(401, send("GET", account, null, null).statusCode());
                assertEquals(403, send("PUT", account, "{\"keyId\":\"" + GOOD_ID + "\",\"keySecret\":\"" + GOOD_SECRET + "\"}", payer).statusCode());
                assertEquals(400, send("PUT", account, "{\"keyId\":\"not-a-key\",\"keySecret\":\"" + GOOD_SECRET + "\"}", organizer).statusCode());
                assertEquals(400, send("PUT", account, "{\"keyId\":\"" + GOOD_ID + "\",\"keySecret\":\"WrongSecret123456\"}", organizer).statusCode());
                var connected = send("PUT", account, "{\"keyId\":\"" + GOOD_ID + "\",\"keySecret\":\"" + GOOD_SECRET + "\"}", organizer);
                assertEquals(200, connected.statusCode(), connected.body());
                assertTrue(connected.body().contains("\"mode\":\"test\""));
                assertFalse(connected.body().contains(GOOD_SECRET), "the secret is never sent back");
                assertFalse(send("GET", account, null, organizer).body().contains(GOOD_SECRET));
                String stored = (String) one(c, "SELECT key_secret_enc FROM public.tournament_payment_accounts WHERE tournament_id = ?::uuid", T1);
                assertNotNull(stored);
                assertFalse(stored.contains(GOOD_SECRET), "the secret is stored encrypted");

                // Paying: only the owner of the registration; a second tap reuses the open link.
                String body = "{\"kind\":\"PLAYER\",\"registrationId\":\"" + regId + "\"}";
                assertEquals(403, send("POST", "/payments/pay", body, other).statusCode());
                assertEquals(403, send("POST", "/payments/pay", body, organizer).statusCode());
                var pay = send("POST", "/payments/pay", body, payer);
                assertEquals(200, pay.statusCode(), pay.body());
                assertTrue(pay.body().contains("https://rzp.io/i/plink_"), pay.body());
                assertEquals(1, created.size());
                assertTrue(created.get(0).contains("\"amount\":25000"), created.get(0));
                assertTrue(created.get(0).contains("https://app.example.test/pay/done"), created.get(0));
                assertEquals(pay.body().replaceAll(".*\"shortUrl\":\"([^\"]+)\".*", "$1"), send("POST", "/payments/pay", body, payer).body().replaceAll(".*\"shortUrl\":\"([^\"]+)\".*", "$1"));
                assertEquals(1, created.size(), "no second payment page");

                // Not paid yet: still open, and the registration cannot be approved.
                assertTrue(send("GET", "/payments/status?kind=PLAYER&registrationId=" + regId, null, payer).body().contains("\"status\":\"CREATED\""));
                try {
                    exec(c, "UPDATE public.player_tournament_registrations SET status = 'APPROVED' WHERE id = ?::uuid", regId);
                    throw new AssertionError("approval must be blocked until the fee is paid");
                } catch (java.sql.SQLException e) {
                    assertTrue(e.getMessage().contains("fee has not been paid"), e.getMessage());
                }

                // The payer pays on Razorpay's page; the app asks again and sees it paid.
                linkStatus.put("plink_1", "paid");
                var paid = send("GET", "/payments/status?kind=PLAYER&registrationId=" + regId, null, payer);
                assertTrue(paid.body().contains("\"status\":\"PAID\"") && paid.body().contains("\"paid\":true"), paid.body());
                assertEquals("pay_plink_1", one(c, "SELECT provider_payment_id FROM public.registration_payments WHERE registration_id = ?::uuid", regId));
                exec(c, "UPDATE public.player_tournament_registrations SET status = 'APPROVED' WHERE id = ?::uuid", regId);
                exec(c, "UPDATE public.player_tournament_registrations SET status = 'PENDING' WHERE id = ?::uuid", regId);

                // Refunds: organizers only, within what was paid, partly then fully.
                String paymentId = (String) one(c, "SELECT id::text FROM public.registration_payments WHERE registration_id = ?::uuid", regId);
                assertEquals(403, send("POST", "/payments/" + paymentId + "/refund", "{\"amount\":50}", payer).statusCode());
                assertEquals(400, send("POST", "/payments/" + paymentId + "/refund", "{\"amount\":999}", organizer).statusCode());
                var part = send("POST", "/payments/" + paymentId + "/refund", "{\"amount\":50}", organizer);
                assertTrue(part.body().contains("PARTIALLY_REFUNDED"), part.body());
                assertTrue(refunds.get(0).contains("pay_plink_1") && refunds.get(0).contains("\"amount\":5000"), refunds.get(0));
                var rest = send("POST", "/payments/" + paymentId + "/refund", null, organizer);
                assertTrue(rest.body().contains("\"status\":\"REFUNDED\""), rest.body());
                assertTrue(refunds.get(1).contains("\"amount\":20000"), refunds.get(1));

                // Disconnecting removes the keys.
                assertTrue(send("DELETE", account, null, organizer).body().contains("\"connected\":false"));
                assertEquals(null, one(c, "SELECT 1 FROM public.tournament_payment_accounts WHERE tournament_id = ?::uuid", T1));
                // With no account the payer is told to pay the organizer directly.
                exec(c, "DELETE FROM public.registration_payments WHERE registration_id = ?::uuid", regId);
                var offline = send("POST", "/payments/pay", body, payer);
                assertEquals(409, offline.statusCode());
                assertTrue(offline.body().contains("offline"), offline.body());
            } finally {
                exec(c, "UPDATE public.tournament_settings SET player_registration_fee = 0 WHERE tournament_id = ?::uuid", T1);
                exec(c, "DELETE FROM public.registration_payments WHERE tournament_id = ?::uuid", T1);
                exec(c, "DELETE FROM public.tournament_payment_accounts WHERE tournament_id = ?::uuid", T1);
                exec(c, "UPDATE public.player_tournament_registrations SET status = 'PENDING' WHERE id = ?::uuid", UUID.fromString(regId));
            }
        }
    }
}
