package app.tourny.api.storage;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The image storage the app uses (public reads, upload, delete), backed by a
 * directory. Buckets and rules follow the old storage policies: images only, 2 MB, and a user
 * writes under their own id; an organizer also writes under their tournament's id in "logos".
 */
@RestController
class StorageController {

    private static final long MAX_BYTES = 2L * 1024 * 1024;
    private static final Set<String> BUCKETS = Set.of("avatars", "logos", "player-photos");
    private static final Pattern SEGMENT = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");
    private static final Pattern UUID = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    private final Path root;
    private final JdbcClient jdbc;
    private final TransactionTemplate tx;

    StorageController(@Value("${tourny.storage.root}") String root, JdbcClient jdbc, TransactionTemplate tx) throws IOException {
        this.root = Path.of(root).toAbsolutePath().normalize();
        Files.createDirectories(this.root);
        this.jdbc = jdbc;
        this.tx = tx;
    }

    @GetMapping("/storage/object/public/{bucket}/**")
    ResponseEntity<Resource> read(@PathVariable String bucket, HttpServletRequest request) {
        Path file = resolve(bucket, objectName(request, "/storage/object/public/" + bucket + "/"));
        if (!Files.isRegularFile(file)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Object not found");
        return ResponseEntity.ok()
                .contentType(contentType(file))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(new FileSystemResource(file));
    }

    @PostMapping("/storage/object/{bucket}/**")
    ResponseEntity<Map<String, String>> create(@PathVariable String bucket, HttpServletRequest request, @AuthenticationPrincipal Jwt jwt) throws Exception {
        return write(bucket, request, jwt, false);
    }

    @PutMapping("/storage/object/{bucket}/**")
    ResponseEntity<Map<String, String>> replace(@PathVariable String bucket, HttpServletRequest request, @AuthenticationPrincipal Jwt jwt) throws Exception {
        return write(bucket, request, jwt, true);
    }

    @DeleteMapping("/storage/object/{bucket}")
    List<Map<String, String>> remove(@PathVariable String bucket, @RequestBody Map<String, List<String>> body, @AuthenticationPrincipal Jwt jwt) throws IOException {
        List<Map<String, String>> removed = new java.util.ArrayList<>();
        for (String name : body.getOrDefault("prefixes", List.of())) {
            Path file = resolve(bucket, name);
            authorize(bucket, name, jwt);
            if (Files.deleteIfExists(file)) removed.add(Map.of("name", name, "bucket_id", bucket));
        }
        return removed;
    }

    // -- internals ----------------------------------------------------------------------------

    private ResponseEntity<Map<String, String>> write(String bucket, HttpServletRequest request, Jwt jwt, boolean upsertDefault) throws Exception {
        String name = objectName(request, "/storage/object/" + bucket + "/");
        Path file = resolve(bucket, name);
        authorize(bucket, name, jwt);
        boolean upsert = upsertDefault || "true".equalsIgnoreCase(request.getHeader("x-upsert"));

        byte[] bytes = fileBytes(request);
        if (bytes.length > MAX_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The object exceeded the maximum allowed size");
        // Trust the bytes, not the declared type: only real JPEG, PNG or WebP images are stored.
        if (!isAllowedImage(bytes)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mime type is not supported");

        if (Files.exists(file) && !upsert) throw new ResponseStatusException(HttpStatus.CONFLICT, "The resource already exists");
        Files.createDirectories(file.getParent());
        Path temp = Files.createTempFile(file.getParent(), ".upload-", ".tmp");
        try {
            Files.write(temp, bytes);
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(temp);
        }
        return ResponseEntity.ok(Map.of("Key", bucket + "/" + name, "Id", java.util.UUID.randomUUID().toString()));
    }

    /** The file is the request body itself. */
    private static byte[] fileBytes(HttpServletRequest request) throws IOException {
        byte[] raw = request.getInputStream().readNBytes((int) MAX_BYTES + 1);
        if (raw.length == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file in the request");
        return raw;
    }

    private void authorize(String bucket, String name, Jwt jwt) {
        if (jwt == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        if (bucket.equals("player-photos")) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This bucket is read-only");
        String owner = name.split("/")[0];
        if (owner.equals(jwt.getSubject())) return;
        if (bucket.equals("logos") && UUID.matcher(owner).matches() && isOrganizer(jwt.getSubject(), owner)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "new row violates row-level security policy");
    }

    /** Asks the database, as the caller, whether they organize the tournament. */
    private boolean isOrganizer(String userId, String tournamentId) {
        return Boolean.TRUE.equals(tx.execute(status -> {
            jdbc.sql("SELECT set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true), set_config('role', 'authenticated', true)")
                    .param("claims", "{\"sub\":\"" + userId + "\",\"role\":\"authenticated\"}").param("sub", userId).query().singleRow();
            return jdbc.sql("SELECT public.is_tournament_organizer(:t::uuid)").param("t", tournamentId).query(Boolean.class).single();
        }));
    }

    private static String objectName(HttpServletRequest request, String prefix) {
        String uri = request.getRequestURI();
        if (!uri.startsWith(prefix) || uri.length() == prefix.length()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid object name");
        return java.net.URLDecoder.decode(uri.substring(prefix.length()), java.nio.charset.StandardCharsets.UTF_8);
    }

    /** Maps a bucket and object name to a file under the storage root, refusing anything that could escape it. */
    private Path resolve(String bucket, String name) {
        if (!BUCKETS.contains(bucket)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bucket not found");
        String[] segments = name.split("/", -1);
        for (String segment : segments) {
            if (!SEGMENT.matcher(segment).matches() || segment.contains("..")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid object name");
        }
        Path file = root.resolve(bucket).resolve(String.join("/", segments)).normalize();
        if (!file.startsWith(root.resolve(bucket))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid object name");
        return file;
    }

    private static boolean isAllowedImage(byte[] b) {
        if (b.length < 12) return false;
        boolean jpeg = (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
        boolean png = (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
        boolean webp = b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
        return jpeg || png || webp;
    }

    private static MediaType contentType(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".png")) return MediaType.IMAGE_PNG;
        if (name.endsWith(".webp")) return MediaType.parseMediaType("image/webp");
        return MediaType.IMAGE_JPEG;
    }
}
