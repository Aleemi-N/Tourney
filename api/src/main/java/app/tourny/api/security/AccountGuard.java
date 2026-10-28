package app.tourny.api.security;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Knows which accounts were deleted. An access token outlives its account (it is valid for an hour), so the token decoder
 * asks here and refuses a deleted account's token. Answers are remembered for a few seconds so busy callers do not hit the
 * database on every request; the account deletion calls {@link #forget} so it takes effect at once.
 */
@Component
public class AccountGuard {

    private record Seen(boolean deleted, long until) {}

    private static final long TTL = Duration.ofSeconds(10).toNanos();

    private final JdbcClient jdbc;
    private final ConcurrentHashMap<UUID, Seen> cache = new ConcurrentHashMap<>();

    AccountGuard(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isDeleted(UUID user) {
        long now = System.nanoTime();
        Seen seen = cache.get(user);
        if (seen == null || seen.until() < now) {
            boolean deleted = jdbc.sql("SELECT status = 'DELETED' FROM public.profiles WHERE id = :u::uuid").param("u", user.toString()).query(Boolean.class).optional().orElse(false);
            seen = new Seen(deleted, now + TTL);
            if (cache.size() > 10_000) cache.clear();
            cache.put(user, seen);
        }
        return seen.deleted();
    }

    public void forget(UUID user) {
        cache.remove(user);
    }
}
