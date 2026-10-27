package app.tourny.api.account;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Account deletion. The database function removes the person's details and their ability to sign in (and refuses when
 * they are the only organizer of a running tournament); this endpoint then deletes the files they uploaded.
 */
@RestController
@RequestMapping("/account/v1")
class AccountController {

    private static final Logger log = LoggerFactory.getLogger(AccountController.class);

    record DeleteRequest(String confirm) {}

    private final JdbcClient jdbc;
    private final Path storageRoot;

    AccountController(JdbcClient jdbc, @Value("${tourny.storage.root}") String storageRoot) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
    }

    @PostMapping("/delete")
    ResponseEntity<Map<String, Object>> delete(@AuthenticationPrincipal Jwt jwt, @RequestBody DeleteRequest body) {
        if (body == null || !"DELETE".equals(body.confirm())) return error(HttpStatus.BAD_REQUEST, "Type DELETE to confirm.");
        UUID user = UUID.fromString(jwt.getSubject());
        try {
            jdbc.sql("SELECT public.delete_account_data(:u::uuid)").param("u", user.toString()).query().singleRow();
        } catch (DataAccessException e) {
            String message = String.valueOf(e.getMostSpecificCause().getMessage());
            String first = message.lines().findFirst().orElse(message).replaceFirst("^ERROR:\\s*", "");
            return error(HttpStatus.CONFLICT, first);
        }
        removeUploads(user);
        return ResponseEntity.ok(Map.of("deleted", true));
    }

    /** Uploads live under storage/<bucket>/<user id>/..., so the person's files are those folders. */
    private void removeUploads(UUID user) {
        try (Stream<Path> buckets = Files.list(storageRoot)) {
            for (Path bucket : (Iterable<Path>) buckets::iterator) {
                Path folder = bucket.resolve(user.toString()).normalize();
                if (!folder.startsWith(bucket) || !Files.isDirectory(folder)) continue;
                try (Stream<Path> files = Files.walk(folder)) {
                    for (Path p : (Iterable<Path>) files.sorted(Comparator.reverseOrder())::iterator) Files.deleteIfExists(p);
                }
            }
        } catch (IOException e) {
            log.warn("could not remove uploads of a deleted account: {}", e.toString());
        }
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }
}
