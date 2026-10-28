package app.tourny.api.account;

import app.tourny.api.security.AccountGuard;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
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
    private final AccountGuard accounts;
    private final Path storageRoot;

    AccountController(JdbcClient jdbc, AccountGuard accounts, @Value("${tourny.storage.root}") String storageRoot) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
    }

    @PostMapping("/delete")
    ResponseEntity<Map<String, Object>> delete(@AuthenticationPrincipal Jwt jwt, @RequestBody DeleteRequest body) {
        if (body == null || !"DELETE".equals(body.confirm())) return error(HttpStatus.BAD_REQUEST, "Type DELETE to confirm.");
        UUID user = UUID.fromString(jwt.getSubject());
        // The database forgets these paths when the account is deleted, so collect the files first.
        List<Path> photos = new ArrayList<>();
        for (String p : jdbc.sql("SELECT photo_path FROM public.player_profiles WHERE user_id = :u::uuid AND photo_path IS NOT NULL").param("u", user.toString()).query(String.class).list()) photos.add(file("player-photos", p));
        for (String p : jdbc.sql("SELECT avatar_path FROM public.profiles WHERE id = :u::uuid AND avatar_path IS NOT NULL").param("u", user.toString()).query(String.class).list()) photos.add(file("avatars", p));
        try {
            jdbc.sql("SELECT public.delete_account_data(:u::uuid)").param("u", user.toString()).query().singleRow();
        } catch (DataAccessException e) {
            String message = String.valueOf(e.getMostSpecificCause().getMessage());
            String first = message.lines().findFirst().orElse(message).replaceFirst("^ERROR:\\s*", "");
            return error(HttpStatus.CONFLICT, first);
        }
        accounts.forget(user);
        removeUploads(user);
        for (Path photo : photos) {
            try { if (photo != null) Files.deleteIfExists(photo); } catch (IOException e) { log.warn("could not remove a photo of a deleted account: {}", e.toString()); }
        }
        return ResponseEntity.ok(Map.of("deleted", true));
    }

    /** A stored object as a file, or null when the name would leave its bucket. */
    private Path file(String bucket, String name) {
        Path folder = storageRoot.resolve(bucket).normalize();
        Path file = folder.resolve(name).normalize();
        return file.startsWith(folder) && !file.equals(folder) ? file : null;
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
