package app.tourny.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Runs against the local database seeded by db/seed.sql (deploy/dev-stack.sh);
 * skipped when that database is not reachable.
 */
@org.springframework.context.annotation.Import(ApiIntegrationTest.CapturingMailer.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = { "server.error.include-message=always", "tourny.push.enabled=false", "tourny.payments.reconcile-ms=600000" })
class ApiIntegrationTest {

    // Defaults to deploy/dev-stack.sh (PostgreSQL on 5440, PostgREST on 3001); for another setup:
    //   TOURNY_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55432/tourny TOURNY_DB_URL=$TOURNY_TEST_DB_URL TOURNY_POSTGREST_URL=http://127.0.0.1:3001
    private static final String DB_URL = System.getenv().getOrDefault("TOURNY_TEST_DB_URL", "jdbc:postgresql://127.0.0.1:5440/tourny");
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static String password;

    @LocalServerPort
    int port;

    // PostgREST verifies tokens with the same secret as the API.
    @DynamicPropertySource
    static void localStack(DynamicPropertyRegistry registry) throws Exception {
        registry.add("tourny.jwt.secret", () -> "dev-only-jwt-secret-0123456789-0123456789");
    }

    private HttpResponse<String> get(String path, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET();
        if (token != null) builder.header("Authorization", "Bearer " + token);
        return HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @BeforeAll
    static void seededDatabase() throws Exception {
        try (var c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            assumeTrue(c.isValid(2));
            c.createStatement().execute("DELETE FROM public.api_rate_events"); // limits from earlier runs must not count here
        } catch (Exception e) {
            assumeTrue(false, "database not reachable at " + DB_URL + ": " + e);
        }
        var seed = Files.readString(Path.of("../db/seed.sql"));
        var m = Pattern.compile("extensions\\.crypt\\('([^']+)'").matcher(seed);
        assertTrue(m.find());
        password = m.group(1);
    }

    private HttpResponse<String> post(String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        return HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String login(String email) throws Exception {
        var response = post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, response.statusCode(), response.body());
        var m = Pattern.compile("\"access_token\":\"([^\"]+)\"").matcher(response.body());
        assertTrue(m.find());
        return m.group(1);
    }

    @Test
    void loginRejectsWrongPasswordAndUnknownEmail() throws Exception {
        assertEquals(400, post("/auth/token?grant_type=password", "{\"email\":\"organizer@tourny.local\",\"password\":\"nope\"}", null).statusCode());
        assertEquals(400, post("/auth/token?grant_type=password", "{\"email\":\"nobody@tourny.local\",\"password\":\"nope\"}", null).statusCode());
    }

    @Test
    void rpcRequiresATokenAndAnAllowListedFunction() throws Exception {
        assertEquals(200, post("/rpc/get_public_standings", "{\"p_tournament_id\":\"90200000-0000-0000-0000-000000000003\"}", null).statusCode()); // public data needs no token
        assertEquals(403, post("/rpc/get_scorer_match_state", "{\"p_match_id\":\"90700000-0000-0000-0000-000000000001\"}", null).statusCode()); // anon has no execute grant
        String token = login("organizer@tourny.local");
        assertEquals(404, post("/rpc/pg_sleep", "{\"seconds\":1}", token).statusCode());
        assertTrue(post("/rpc/get_public_standings;drop", "{}", token).statusCode() >= 400);
    }

    @Test
    void rpcRunsAsTheSignedInUser() throws Exception {
        String organizer = login("organizer@tourny.local");
        String player = login("player@tourny.local");
        String match = "\"p_match_id\":\"90700000-0000-0000-0000-000000000001\"";

        // The organizer may read the scorer state; a player may not (the function checks auth.uid()).
        var allowed = post("/rpc/get_scorer_match_state", "{" + match + "}", organizer);
        assertEquals(200, allowed.statusCode(), allowed.body());
        assertTrue(allowed.body().contains("\"home_team\""));
        var denied = post("/rpc/get_scorer_match_state", "{" + match + "}", player);
        assertEquals(400, denied.statusCode());
        assertTrue(denied.body().contains("Unauthorized"), denied.body());

        // Typed arguments, arrays and set-returning results all go through the same path.
        var standings = post("/rpc/get_public_standings", "{\"p_tournament_id\":\"90200000-0000-0000-0000-000000000003\"}", null == organizer ? null : organizer);
        assertEquals(200, standings.statusCode(), standings.body());
        assertTrue(standings.body().startsWith("["));
        assertEquals(400, post("/rpc/get_public_standings", "{\"bogus\":1}", organizer).statusCode());
    }

    @Test
    void restKeepsThePostgrestQueryLanguageAndRowSecurity() throws Exception {
        // Public data is readable signed out, with embedding and filters as the web client sends them.
        var teams = get("/rest/teams?select=id,name,tournaments(name)&limit=3", null);
        assertEquals(200, teams.statusCode(), "status " + teams.statusCode() + " " + teams.body());
        assertTrue(teams.body().startsWith("["));

        // Signed in, the caller's own row-level security applies: a player sees only their own applications.
        var player = login("player@tourny.local");
        var own = get("/rest/team_owner_applications?select=user_id", player);
        assertEquals(200, own.statusCode(), own.body());
        var organizer = login("organizer@tourny.local");
        var all = get("/rest/team_owner_applications?select=user_id", organizer);
        assertTrue(all.body().length() >= own.body().length());

        // A forged token never reaches the database.
        assertEquals(401, get("/rest/teams?select=id", "not-a-token").statusCode());
    }

    private static String field(String json, String name) {
        var m = Pattern.compile("\"" + name + "\":\"([^\"]+)\"").matcher(json);
        assertTrue(m.find(), json);
        return m.group(1);
    }

    @Test
    void sessionsRefreshRotateAndReuseEndsTheSession() throws Exception {
        var first = post("/auth/token?grant_type=password", "{\"email\":\"player@tourny.local\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, first.statusCode(), first.body());
        String access = field(first.body(), "access_token");
        String refresh = field(first.body(), "refresh_token");

        var me = get("/auth/user", access);
        assertEquals(200, me.statusCode(), me.body());
        assertEquals("player@tourny.local", field(me.body(), "email"));
        assertEquals(401, get("/auth/user", null).statusCode());

        var second = post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null);
        assertEquals(200, second.statusCode(), second.body());
        String rotated = field(second.body(), "refresh_token");

        // Replaying the old token after the short grace window is theft: it fails and revokes the rotated one too.
        try (var c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            c.createStatement().execute("UPDATE public.api_refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE revoked_at IS NOT NULL AND user_id = (SELECT id FROM auth.users WHERE email = 'player@tourny.local')");
        }
        assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null).statusCode());
        assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + rotated + "\"}", null).statusCode());
    }

    @Test
    void signUpCreatesAnAccountThatCanSignIn() throws Exception {
        String email = "signup-" + System.nanoTime() + "@tourny.local";
        var created = post("/auth/signup", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\",\"data\":{\"full_name\":\"Sign Up Test\"}}", null);
        assertEquals(200, created.statusCode(), created.body());
        assertEquals(422, post("/auth/signup", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\"}", null).statusCode());
        assertEquals(422, post("/auth/signup", "{\"email\":\"x" + email + "\",\"password\":\"short\"}", null).statusCode());
        var login = post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\"}", null);
        assertEquals(200, login.statusCode(), login.body());
        // The profile row comes from the existing handle_new_user trigger.
        var profile = get("/rest/profiles?select=full_name&id=eq." + field(login.body(), "id"), field(login.body(), "access_token"));
        assertTrue(profile.body().contains("Sign Up Test"), profile.body());
    }

    // A 1x1 PNG.
    private static final byte[] PNG = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    private HttpResponse<String> upload(String path, byte[] bytes, String filename, String token, String method) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "image/png").header("Authorization", "Bearer " + token)
                .method(method, HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void storageBucketRules() throws Exception {
        String player = login("player@tourny.local");
        String playerId = field(post("/auth/token?grant_type=password", "{\"email\":\"player@tourny.local\",\"password\":\"" + password + "\"}", null).body(), "id");
        String name = playerId + "/" + System.nanoTime() + ".png";

        var created = upload("/storage/object/avatars/" + name, PNG, "a.png", player, "POST");
        assertEquals(200, created.statusCode(), created.body());
        var read = HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/object/public/avatars/" + name)).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, read.statusCode());
        assertEquals("image/png", read.headers().firstValue("content-type").orElse(""));
        assertTrue(java.util.Arrays.equals(PNG, read.body()));

        assertEquals(409, upload("/storage/object/avatars/" + name, PNG, "a.png", player, "POST").statusCode()); // no silent overwrite
        assertEquals(200, upload("/storage/object/avatars/" + name, PNG, "a.png", player, "PUT").statusCode());
        assertEquals(403, upload("/storage/object/avatars/90000000-0000-0000-0000-000000000001/x.png", PNG, "x.png", player, "POST").statusCode()); // someone else's folder
        assertEquals(400, upload("/storage/object/avatars/" + playerId + "/fake.png", "<html>not an image</html>".getBytes(), "fake.png", player, "POST").statusCode());
        assertTrue(upload("/storage/object/avatars/" + playerId + "/..%2Fx.png", PNG, "x.png", player, "POST").statusCode() >= 400); // traversal
        assertEquals(403, upload("/storage/object/player-photos/" + playerId + "/x.png", PNG, "x.png", player, "POST").statusCode()); // read-only bucket

        // An organizer writes into their tournament's logo folder; a player may not.
        String organizer = login("organizer@tourny.local");
        String logo = "/storage/object/logos/90200000-0000-0000-0000-000000000001/" + System.nanoTime() + ".png";
        assertEquals(200, upload(logo, PNG, "l.png", organizer, "POST").statusCode());
        assertEquals(403, upload(logo + "x", PNG, "l.png", player, "POST").statusCode());

        var removed = HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/object/avatars"))
                .header("Authorization", "Bearer " + player).header("Content-Type", "application/json")
                .method("DELETE", HttpRequest.BodyPublishers.ofString("{\"prefixes\":[\"" + name + "\"]}")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, removed.statusCode(), removed.body());
        assertEquals(404, HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/object/public/avatars/" + name)).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
    }

    private HttpResponse<String> patch(String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json").header("Prefer", "return=representation")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(body));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        return HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void clientsCannotWriteTablesDirectly() throws Exception {
        String player = login("player@tourny.local");
        // Self-approval and self-unsuspension were possible through the REST endpoint before.
        assertEquals(403, patch("/rest/team_owner_applications?status=eq.PENDING", "{\"status\":\"APPROVED\"}", player).statusCode());
        assertEquals(403, patch("/rest/profiles?id=not.is.null", "{\"status\":\"ACTIVE\"}", player).statusCode());
        assertEquals(403, patch("/rest/organization_members?user_id=not.is.null", "{\"role\":\"OWNER\"}", player).statusCode());
        // The columns the apps still update directly keep working for an organizer (zero rows here, but not refused).
        String organizer = login("organizer@tourny.local");
        assertEquals(200, patch("/rest/tournaments?id=eq.00000000-0000-0000-0000-000000000000", "{\"status\":\"PREPARATION\"}", organizer).statusCode());
        // ...but not other columns of the same table.
        assertEquals(403, patch("/rest/tournaments?id=eq.90200000-0000-0000-0000-000000000001", "{\"name\":\"Renamed\"}", organizer).statusCode());
    }

    @Test
    void suspendedAccountsCannotSignInOrRefresh() throws Exception {
        try (var c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            var first = post("/auth/token?grant_type=password", "{\"email\":\"scorer@tourny.local\",\"password\":\"" + password + "\"}", null);
            assertEquals(200, first.statusCode(), first.body());
            String refresh = field(first.body(), "refresh_token");
            c.createStatement().executeUpdate("UPDATE public.profiles SET status='SUSPENDED' WHERE id=(SELECT id FROM auth.users WHERE email='scorer@tourny.local')");
            try {
                assertEquals(400, post("/auth/token?grant_type=password", "{\"email\":\"scorer@tourny.local\",\"password\":\"" + password + "\"}", null).statusCode());
                assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null).statusCode());
            } finally {
                c.createStatement().executeUpdate("UPDATE public.profiles SET status='ACTIVE' WHERE id=(SELECT id FROM auth.users WHERE email='scorer@tourny.local')");
            }
        }
    }

    @Test
    void storageAcceptsARawBodyLikeStorageJsSendsForBuffers() throws Exception {
        String player = login("player@tourny.local");
        String playerId = field(post("/auth/token?grant_type=password", "{\"email\":\"player@tourny.local\",\"password\":\"" + password + "\"}", null).body(), "id");
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/object/avatars/" + playerId + "/raw-" + System.nanoTime() + ".png"))
                .header("Content-Type", "image/png").header("Authorization", "Bearer " + player).header("x-upsert", "true")
                .POST(HttpRequest.BodyPublishers.ofByteArray(PNG)).build();
        assertEquals(200, HTTP.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
        var notImage = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/object/avatars/" + playerId + "/raw-bad.png"))
                .header("Content-Type", "image/png").header("Authorization", "Bearer " + player)
                .POST(HttpRequest.BodyPublishers.ofString("<html>nope</html>")).build();
        assertEquals(400, HTTP.send(notImage, HttpResponse.BodyHandlers.ofString()).statusCode());
    }

    /** Captures recovery links instead of sending email. */
    @org.springframework.boot.test.context.TestConfiguration
    static class CapturingMailer {
        static final java.util.List<String[]> SENT = new java.util.concurrent.CopyOnWriteArrayList<>();

        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        app.tourny.api.security.RecoveryMailer capturing() {
            return (email, link) -> SENT.add(new String[] {email, link});
        }
    }

    private static String challenge(String verifier) throws Exception {
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(verifier.getBytes()));
    }

    private String requestRecovery(String email, String verifier, String redirectTo) throws Exception {
        int before = CapturingMailer.SENT.size();
        var response = post("/auth/recover" + (redirectTo == null ? "" : "?redirect_to=" + java.net.URLEncoder.encode(redirectTo, "UTF-8")),
                "{\"email\":\"" + email + "\",\"code_challenge\":\"" + challenge(verifier) + "\",\"code_challenge_method\":\"s256\"}", null);
        assertEquals(200, response.statusCode(), response.body());
        for (int i = 0; i < 40 && CapturingMailer.SENT.size() == before; i++) Thread.sleep(50); // the mail goes out in the background
        return CapturingMailer.SENT.size() > before ? CapturingMailer.SENT.get(CapturingMailer.SENT.size() - 1)[1] : null;
    }

    @Test
    void passwordRecoveryUsesAOneTimePkceCode() throws Exception {
        String verifier = "verifier-" + "x".repeat(50);
        String link = requestRecovery("player@tourny.local", verifier, "http://localhost:3100/auth/callback?next=/reset-password");
        assertTrue(link.startsWith("http://localhost:3100/auth/callback?next=/reset-password&code="), link);
        String code = link.substring(link.indexOf("code=") + 5);

        // A wrong verifier fails and burns the code.
        assertEquals(400, post("/auth/token?grant_type=pkce", "{\"auth_code\":\"" + code + "\",\"code_verifier\":\"wrong\"}", null).statusCode());
        assertEquals(400, post("/auth/token?grant_type=pkce", "{\"auth_code\":\"" + code + "\",\"code_verifier\":\"" + verifier + "\"}", null).statusCode());

        String second = requestRecovery("player@tourny.local", verifier, "http://localhost:3100/auth/callback");
        String code2 = second.substring(second.indexOf("code=") + 5);
        var session = post("/auth/token?grant_type=pkce", "{\"auth_code\":\"" + code2 + "\",\"code_verifier\":\"" + verifier + "\"}", null);
        assertEquals(200, session.statusCode(), session.body());
        assertEquals("player@tourny.local", field(session.body(), "email"));
        assertEquals(400, post("/auth/token?grant_type=pkce", "{\"auth_code\":\"" + code2 + "\",\"code_verifier\":\"" + verifier + "\"}", null).statusCode()); // single use

        // A link never points at a site we do not know, and unknown emails get the same answer but no mail.
        String evil = requestRecovery("scorer@tourny.local", verifier, "https://evil.example/steal");
        assertTrue(evil.startsWith("http://localhost:3000/auth/callback?code=") || evil.startsWith("http://localhost:3100/auth/callback?code=") || evil.startsWith("http://localhost:8081/auth/callback?code="), evil);
        assertTrue(requestRecovery("nobody@tourny.local", verifier, null) == null);
    }

    @Test
    void restProxyDoesNotExposeFunctionsOrTheSchema() throws Exception {
        String token = login("organizer@tourny.local");
        // The helper is not on the allow-list, so POST /rpc refuses it...
        assertEquals(404, post("/rpc/is_tournament_organizer", "{\"tourn_id\":\"90200000-0000-0000-0000-000000000001\"}", token).statusCode());
        // ...and the proxy must not be a way around that, nor list every table and function.
        assertEquals(404, post("/rest/rpc/is_tournament_organizer", "{\"tourn_id\":\"90200000-0000-0000-0000-000000000001\"}", token).statusCode());
        assertEquals(404, get("/rest/", token).statusCode());
        assertEquals(404, get("/rest", null).statusCode());
        assertTrue(get("/rest/tournaments/../rpc/is_tournament_organizer", token).statusCode() >= 400);
        assertEquals(200, get("/rest/tournaments?select=id&limit=1", token).statusCode());
    }

    @Test
    void aSessionThatRenewsTwiceAtOnceSurvivesButALaterReplayEndsEverything() throws Exception {
        var first = post("/auth/token?grant_type=password", "{\"email\":\"owner@tourny.local\",\"password\":\"" + password + "\"}", null);
        String refresh = field(first.body(), "refresh_token");
        var a = post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null);
        var b = post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null); // a parallel renewal with the same token
        assertEquals(200, a.statusCode(), a.body());
        assertEquals(200, b.statusCode(), b.body());
        try (var c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            c.createStatement().execute("UPDATE public.api_refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE revoked_at IS NOT NULL AND user_id = (SELECT id FROM auth.users WHERE email = 'owner@tourny.local')");
        }
        assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null).statusCode()); // replayed later: theft
        assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + field(b.body(), "refresh_token") + "\"}", null).statusCode());
    }

    @Test
    void changingThePasswordEndsEverySession() throws Exception {
        String email = "sessions-" + System.nanoTime() + "@tourny.local";
        assertEquals(200, post("/auth/signup", "{\"email\":\"" + email + "\",\"password\":\"first-password\"}", null).statusCode());
        var one = post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"first-password\"}", null);
        var two = post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"first-password\"}", null);
        var change = HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/auth/user")).header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + field(one.body(), "access_token")).PUT(HttpRequest.BodyPublishers.ofString("{\"password\":\"second-password\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, change.statusCode(), change.body());
        // A stolen session cannot be renewed after the password changed, not even right away.
        assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + field(one.body(), "refresh_token") + "\"}", null).statusCode());
        assertEquals(400, post("/auth/token?grant_type=refresh_token", "{\"refresh_token\":\"" + field(two.body(), "refresh_token") + "\"}", null).statusCode());
        assertEquals(200, post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"second-password\"}", null).statusCode());
        assertEquals(400, post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"first-password\"}", null).statusCode());
    }

    @Test
    void accountsNeedAnEmailAndAStrongEnoughPassword() throws Exception {
        String tag = "" + System.nanoTime();
        assertEquals(422, post("/auth/signup", "{\"email\":\"not-an-email\",\"password\":\"long-enough-1\"}", null).statusCode());
        assertEquals(422, post("/auth/signup", "{\"email\":\"short-" + tag + "@tourny.local\",\"password\":\"1234567\"}", null).statusCode());
        assertEquals(422, post("/auth/signup", "{\"email\":\"long-" + tag + "@tourny.local\",\"password\":\"" + "x".repeat(73) + "\"}", null).statusCode()); // bcrypt reads 72 bytes
        assertEquals(200, post("/auth/signup", "{\"email\":\"ok-" + tag + "@tourny.local\",\"password\":\"12345678\"}", null).statusCode());
        assertEquals(400, post("/auth/token?grant_type=password", "{\"email\":\"ok-" + tag + "@tourny.local\",\"password\":\"" + "x".repeat(500) + "\"}", null).statusCode()); // refused, not a 500
    }

    @Test
    void recoveryRequiresS256AndIsLimitedPerEmail() throws Exception {
        String challenge = challenge("v".repeat(50));
        assertEquals(400, post("/auth/recover", "{\"email\":\"player@tourny.local\",\"code_challenge\":\"" + challenge + "\",\"code_challenge_method\":\"plain\"}", null).statusCode());
        assertEquals(400, post("/auth/recover", "{\"email\":\"player@tourny.local\"}", null).statusCode());
        String email = "limit-" + System.nanoTime() + "@tourny.local";
        for (int i = 0; i < 3; i++) assertEquals(200, post("/auth/recover", "{\"email\":\"" + email + "\",\"code_challenge\":\"" + challenge + "\",\"code_challenge_method\":\"s256\"}", null).statusCode());
        assertEquals(429, post("/auth/recover", "{\"email\":\"" + email + "\",\"code_challenge\":\"" + challenge + "\",\"code_challenge_method\":\"s256\"}", null).statusCode());
    }

    @Test
    void signInFailuresAreCountedInTheDatabaseAndLimitedPerEmail() throws Exception {
        String email = "lockout-" + System.nanoTime() + "@tourny.local";
        for (int i = 0; i < 10; i++) assertEquals(400, post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}", null).statusCode());
        assertEquals(429, post("/auth/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}", null).statusCode());
        try (var c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            var rs = c.createStatement().executeQuery("SELECT count(*) FROM public.api_rate_events WHERE bucket = 'login-email'");
            rs.next();
            assertTrue(rs.getInt(1) >= 10, "failures are stored, so a restart does not forget them");
        }
    }
}
