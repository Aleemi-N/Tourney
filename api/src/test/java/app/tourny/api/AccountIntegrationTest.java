package app.tourny.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Deleting an account through the API: the confirmation, the sign-in being gone, and the person's uploaded files. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = { "tourny.push.enabled=false", "tourny.payments.reconcile-ms=600000" })
class AccountIntegrationTest {

    private static final String DB_URL = System.getenv().getOrDefault("TOURNY_TEST_DB_URL", "jdbc:postgresql://127.0.0.1:5440/tourny");
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static Path storage;

    @LocalServerPort
    int port;

    @DynamicPropertySource
    static void config(DynamicPropertyRegistry registry) throws Exception {
        storage = Files.createTempDirectory("tourny-account-test");
        registry.add("tourny.storage.root", () -> storage.toString());
        registry.add("tourny.jwt.secret", () -> "dev-only-jwt-secret-0123456789-0123456789");
    }

    @BeforeAll
    static void reachable() {
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres")) {
            assumeTrue(c.isValid(2));
        } catch (Exception e) {
            assumeTrue(false, "database not reachable at " + DB_URL + ": " + e);
        }
    }

    private HttpResponse<String> send(String path, String json, String token) throws Exception {
        var b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json));
        if (token != null) b.header("Authorization", "Bearer " + token);
        return HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static String field(String json, String name) {
        var m = Pattern.compile("\"" + name + "\":\"([^\"]+)\"").matcher(json);
        assertTrue(m.find(), json);
        return m.group(1);
    }

    @Test
    void deletingAnAccountRemovesTheSignInAndTheUploadedFiles() throws Exception {
        String email = "delete-" + System.nanoTime() + "@tourny.local";
        var created = send("/auth/v1/signup", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\",\"data\":{\"full_name\":\"Leaving Soon\"}}", null);
        assertEquals(200, created.statusCode(), created.body());
        String userId = field(created.body(), "id");
        String token = field(send("/auth/v1/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\"}", null).body(), "access_token");

        Path upload = Files.createDirectories(storage.resolve("avatars").resolve(userId)).resolve("photo.png");
        Files.writeString(upload, "x");
        // A photo whose path is not under the person's folder (the database holds the path, so deleting the account must remove the file).
        Path legacy = Files.createDirectories(storage.resolve("avatars").resolve("legacy")).resolve(userId + ".png");
        Files.writeString(legacy, "z");
        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres"); var st = c.prepareStatement("UPDATE public.profiles SET avatar_path = ? WHERE id = ?::uuid")) {
            st.setString(1, "legacy/" + userId + ".png");
            st.setString(2, userId);
            st.executeUpdate();
        }
        Path someoneElses = Files.createDirectories(storage.resolve("avatars").resolve("00000000-0000-0000-0000-000000000abc")).resolve("keep.png");
        Files.writeString(someoneElses, "y");

        assertTrue(send("/account/v1/delete", "{\"confirm\":\"DELETE\"}", null).statusCode() >= 400, "needs a signed-in user");
        assertEquals(400, send("/account/v1/delete", "{\"confirm\":\"yes\"}", token).statusCode());
        assertTrue(Files.exists(upload), "nothing is removed without the confirmation");

        var done = send("/account/v1/delete", "{\"confirm\":\"DELETE\"}", token);
        assertEquals(200, done.statusCode(), done.body());
        assertFalse(Files.exists(upload), "the person's files are removed");
        assertFalse(Files.exists(legacy), "a photo stored outside the person's folder is removed too");
        assertTrue(Files.exists(someoneElses), "other people's files are not");
        // The access token issued before the deletion is refused from now on, even though it has not expired.
        var stale = HTTP.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/rest/v1/profiles?select=id")).header("Authorization", "Bearer " + token).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(401, stale.statusCode(), stale.body());
        assertEquals(400, send("/auth/v1/token?grant_type=password", "{\"email\":\"" + email + "\",\"password\":\"correct-horse\"}", null).statusCode(), "cannot sign in any more");

        try (Connection c = DriverManager.getConnection(DB_URL, "postgres", "postgres"); var st = c.prepareStatement("SELECT status, email FROM public.profiles WHERE id = ?::uuid")) {
            st.setString(1, userId);
            try (var rs = st.executeQuery()) {
                assertTrue(rs.next());
                assertEquals("DELETED", rs.getString(1));
                assertEquals(null, rs.getString(2));
            }
            try (var del = c.prepareStatement("DELETE FROM auth.users WHERE id = ?::uuid")) {
                del.setString(1, userId);
                del.executeUpdate();
            }
        }
    }
}
