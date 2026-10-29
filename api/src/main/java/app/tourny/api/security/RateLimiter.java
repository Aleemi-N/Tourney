package app.tourny.api.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Counts events per bucket and key (an email address, an IP address) in the database, so limits survive a restart and
 * memory cannot grow without bound. Each call commits on its own: a refused sign-in rolls its own transaction back, and
 * the failure it recorded must stay.
 */
@Component
class RateLimiter {

    private final JdbcClient jdbc;

    RateLimiter(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public boolean exceeded(String bucket, String key, int max, Duration window) {
        long count = jdbc.sql("SELECT count(*) FROM public.api_rate_events WHERE bucket = :b AND key_hash = :k AND at > :since")
                .param("b", bucket).param("k", hash(key)).param("since", java.sql.Timestamp.from(Instant.now().minus(window))).query(Long.class).single();
        return count >= max;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String bucket, String key) {
        jdbc.sql("INSERT INTO public.api_rate_events (bucket, key_hash) VALUES (:b, :k)").param("b", bucket).param("k", hash(key)).update();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void clear(String bucket, String key) {
        jdbc.sql("DELETE FROM public.api_rate_events WHERE bucket = :b AND key_hash = :k").param("b", bucket).param("k", hash(key)).update();
    }

    /** Nothing is counted for longer than a day. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1M")
    void prune() {
        jdbc.sql("DELETE FROM public.api_rate_events WHERE at < now() - interval '1 day'").update();
    }

    private static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
