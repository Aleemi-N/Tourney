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
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiIntegrationTest {

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
        try (var c = DriverManager.getConnection("jdbc:postgresql://127.0.0.1:54322/postgres", "postgres", "postgres")) {
            assumeTrue(c.isValid(2));
        } catch (Exception e) {
            assumeTrue(false, "local database not running");
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
        var response = post("/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, response.statusCode(), response.body());
        var m = Pattern.compile("\"access_token\":\"([^\"]+)\"").matcher(response.body());
        assertTrue(m.find());
        return m.group(1);
    }

    @Test
    void loginRejectsWrongPasswordAndUnknownEmail() throws Exception {
        assertEquals(401, post("/auth/login", "{\"email\":\"organizer@tourny.local\",\"password\":\"nope\"}", null).statusCode());
        assertEquals(401, post("/auth/login", "{\"email\":\"nobody@tourny.local\",\"password\":\"nope\"}", null).statusCode());
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
}
