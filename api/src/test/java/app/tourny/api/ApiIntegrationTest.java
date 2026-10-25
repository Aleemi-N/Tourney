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
 * Runs against the local Supabase database seeded by supabase/seed.sql (supabase db reset --local);
 * skipped when that database is not reachable.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "server.error.include-message=always")
class ApiIntegrationTest {

    // Defaults to the local Supabase stack; deploy/rehearse.sh gives a plain PostgreSQL + PostgREST setup:
    //   TOURNY_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55432/tourny TOURNY_DB_URL=$TOURNY_TEST_DB_URL TOURNY_POSTGREST_URL=http://127.0.0.1:3001
    private static final String DB_URL = System.getenv().getOrDefault("TOURNY_TEST_DB_URL", "jdbc:postgresql://127.0.0.1:54322/postgres");
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static String password;

    @LocalServerPort
    int port;

    // The local Supabase PostgREST verifies tokens with its own secret and sits behind Kong's anon key.
    @DynamicPropertySource
    static void localSupabase(DynamicPropertyRegistry registry) throws Exception {
        registry.add("tourny.jwt.secret", () -> "super-secret-jwt-token-with-at-least-32-characters-long");
        var env = Pattern.compile("NEXT_PUBLIC_SUPABASE_ANON_KEY=\"?([^\"\\s]+)").matcher(Files.readString(Path.of("../.env.local")));
        if (env.find()) registry.add("tourny.postgrest.api-key", () -> env.group(1));
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
        } catch (Exception e) {
            assumeTrue(false, "database not reachable at " + DB_URL + ": " + e);
        }
        var seed = Files.readString(Path.of("../supabase/seed.sql"));
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
        var response = post("/auth/v1/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, response.statusCode(), response.body());
        var m = Pattern.compile("\"access_token\":\"([^\"]+)\"").matcher(response.body());
        assertTrue(m.find());
        return m.group(1);
    }

    @Test
    void loginRejectsWrongPasswordAndUnknownEmail() throws Exception {
        assertEquals(400, post("/auth/v1/token?grant_type=password", "{\"email\":\"organizer@tourny.local\",\"password\":\"nope\"}", null).statusCode());
        assertEquals(400, post("/auth/v1/token?grant_type=password", "{\"email\":\"nobody@tourny.local\",\"password\":\"nope\"}", null).statusCode());
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
        // Public data is readable signed out, with embedding and filters as supabase-js sends them.
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
        var first = post("/auth/v1/token?grant_type=password", "{\"email\":\"player@tourny.local\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, first.statusCode(), first.body());
        String access = field(first.body(), "access_token");
        String refresh = field(first.body(), "refresh_token");

        var me = get("/auth/v1/user", access);
        assertEquals(200, me.statusCode(), me.body());
        assertEquals("player@tourny.local", field(me.body(), "email"));
        assertEquals(401, get("/auth/v1/user", null).statusCode());

        var second = post("/auth/v1/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null);
        assertEquals(200, second.statusCode(), second.body());
        String rotated = field(second.body(), "refresh_token");

        // Replaying the old token is theft: it fails and revokes the rotated one too.
        assertEquals(400, post("/auth/v1/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null).statusCode());
        assertEquals(400, post("/auth/v1/token?grant_type=refresh_token", "{\"refresh_token\":\"" + rotated + "\"}", null).statusCode());
    }

    @Test
    void signUpCreatesAnAccountThatCanSignIn() throws Exception {
        String email = "signup-" + System.nanoTime() + "@tourny.local";
        var created = post("/auth/v1/signup", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\",\"data\":{\"full_name\":\"Sign Up Test\"}}", null);
        assertEquals(200, created.statusCode(), created.body());
        assertEquals(422, post("/auth/v1/signup", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\"}", null).statusCode());
        assertEquals(422, post("/auth/v1/signup", "{\"email\":\"x" + email + "\",\"password\":\"short\"}", null).statusCode());
        var login = post("/auth/v1/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\"}", null);
        assertEquals(200, login.statusCode(), login.body());
        // The profile row comes from the existing handle_new_user trigger.
        var profile = get("/rest/v1/profiles?select=full_name&id=eq." + field(login.body(), "id"), field(login.body(), "access_token"));
        assertTrue(profile.body().contains("Sign Up Test"), profile.body());
    }

    // A 1x1 PNG.
    private static final byte[] PNG = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    private HttpResponse<String> upload(String path, byte[] bytes, String filename, String token, String method) throws Exception {
        String boundary = "----tourny" + System.nanoTime();
        var out = new java.io.ByteArrayOutputStream();
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"cacheControl\"\r\n\r\n3600\r\n").getBytes());
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"\"; filename=\"" + filename + "\"\r\nContent-Type: image/png\r\n\r\n").getBytes());
        out.write(bytes);
        out.write(("\r\n--" + boundary + "--\r\n").getBytes());
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary).header("Authorization", "Bearer " + token)
                .method(method, HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())).build();
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void storageFollowsTheOldBucketRules() throws Exception {
        String player = login("player@tourny.local");
        String playerId = field(post("/auth/v1/token?grant_type=password", "{\"email\":\"player@tourny.local\",\"password\":\"" + password + "\"}", null).body(), "id");
        String name = playerId + "/" + System.nanoTime() + ".png";

        var created = upload("/storage/v1/object/avatars/" + name, PNG, "a.png", player, "POST");
        assertEquals(200, created.statusCode(), created.body());
        var read = HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/v1/object/public/avatars/" + name)).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, read.statusCode());
        assertEquals("image/png", read.headers().firstValue("content-type").orElse(""));
        assertTrue(java.util.Arrays.equals(PNG, read.body()));

        assertEquals(409, upload("/storage/v1/object/avatars/" + name, PNG, "a.png", player, "POST").statusCode()); // no silent overwrite
        assertEquals(200, upload("/storage/v1/object/avatars/" + name, PNG, "a.png", player, "PUT").statusCode());
        assertEquals(403, upload("/storage/v1/object/avatars/90000000-0000-0000-0000-000000000001/x.png", PNG, "x.png", player, "POST").statusCode()); // someone else's folder
        assertEquals(400, upload("/storage/v1/object/avatars/" + playerId + "/fake.png", "<html>not an image</html>".getBytes(), "fake.png", player, "POST").statusCode());
        assertTrue(upload("/storage/v1/object/avatars/" + playerId + "/..%2Fx.png", PNG, "x.png", player, "POST").statusCode() >= 400); // traversal
        assertEquals(403, upload("/storage/v1/object/player-photos/" + playerId + "/x.png", PNG, "x.png", player, "POST").statusCode()); // read-only bucket

        // An organizer writes into their tournament's logo folder; a player may not.
        String organizer = login("organizer@tourny.local");
        String logo = "/storage/v1/object/logos/90200000-0000-0000-0000-000000000001/" + System.nanoTime() + ".png";
        assertEquals(200, upload(logo, PNG, "l.png", organizer, "POST").statusCode());
        assertEquals(403, upload(logo + "x", PNG, "l.png", player, "POST").statusCode());

        var removed = HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/v1/object/avatars"))
                .header("Authorization", "Bearer " + player).header("Content-Type", "application/json")
                .method("DELETE", HttpRequest.BodyPublishers.ofString("{\"prefixes\":[\"" + name + "\"]}")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, removed.statusCode(), removed.body());
        assertEquals(404, HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/v1/object/public/avatars/" + name)).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
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
        assertEquals(403, patch("/rest/v1/team_owner_applications?status=eq.PENDING", "{\"status\":\"APPROVED\"}", player).statusCode());
        assertEquals(403, patch("/rest/v1/profiles?id=not.is.null", "{\"status\":\"ACTIVE\"}", player).statusCode());
        assertEquals(403, patch("/rest/v1/organization_members?user_id=not.is.null", "{\"role\":\"OWNER\"}", player).statusCode());
        // The columns the apps still update directly keep working for an organizer (zero rows here, but not refused).
        String organizer = login("organizer@tourny.local");
        assertEquals(200, patch("/rest/v1/tournaments?id=eq.00000000-0000-0000-0000-000000000000", "{\"status\":\"PREPARATION\"}", organizer).statusCode());
        // ...but not other columns of the same table.
        assertEquals(403, patch("/rest/v1/tournaments?id=eq.90200000-0000-0000-0000-000000000001", "{\"name\":\"Renamed\"}", organizer).statusCode());
    }

    @Test
    void suspendedAccountsCannotSignInOrRefresh() throws Exception {
        try (var c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            var first = post("/auth/v1/token?grant_type=password", "{\"email\":\"scorer@tourny.local\",\"password\":\"" + password + "\"}", null);
            assertEquals(200, first.statusCode(), first.body());
            String refresh = field(first.body(), "refresh_token");
            c.createStatement().executeUpdate("UPDATE public.profiles SET status='SUSPENDED' WHERE id=(SELECT id FROM auth.users WHERE email='scorer@tourny.local')");
            try {
                assertEquals(400, post("/auth/v1/token?grant_type=password", "{\"email\":\"scorer@tourny.local\",\"password\":\"" + password + "\"}", null).statusCode());
                assertEquals(400, post("/auth/v1/token?grant_type=refresh_token", "{\"refresh_token\":\"" + refresh + "\"}", null).statusCode());
            } finally {
                c.createStatement().executeUpdate("UPDATE public.profiles SET status='ACTIVE' WHERE id=(SELECT id FROM auth.users WHERE email='scorer@tourny.local')");
            }
        }
    }

    @Test
    void storageAcceptsARawBodyLikeStorageJsSendsForBuffers() throws Exception {
        String player = login("player@tourny.local");
        String playerId = field(post("/auth/v1/token?grant_type=password", "{\"email\":\"player@tourny.local\",\"password\":\"" + password + "\"}", null).body(), "id");
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/v1/object/avatars/" + playerId + "/raw-" + System.nanoTime() + ".png"))
                .header("Content-Type", "image/png").header("Authorization", "Bearer " + player).header("x-upsert", "true")
                .POST(HttpRequest.BodyPublishers.ofByteArray(PNG)).build();
        assertEquals(200, HTTP.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
        var notImage = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/storage/v1/object/avatars/" + playerId + "/raw-bad.png"))
                .header("Content-Type", "image/png").header("Authorization", "Bearer " + player)
                .POST(HttpRequest.BodyPublishers.ofString("<html>nope</html>")).build();
        assertEquals(400, HTTP.send(notImage, HttpResponse.BodyHandlers.ofString()).statusCode());
    }
}
