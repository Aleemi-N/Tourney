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
        assertEquals(401, post("/rpc/get_public_standings", "{}", null).statusCode());
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
}
