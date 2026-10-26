package app.tourny.api.push;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Sends the messages that database triggers queue in push_outbox to the devices' Expo push tokens.
 * The outbox is polled (not LISTENed to), so a message queued while the API was down still goes out,
 * and several API instances can run side by side (rows are claimed with FOR UPDATE SKIP LOCKED).
 */
@Component
class PushDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);
    private static final int MAX_ATTEMPTS = 5;
    private static final int EXPO_BATCH = 100;

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final RestClient client;
    private final boolean enabled;
    private final String url;
    private final String accessToken;

    PushDispatcher(JdbcClient jdbc, TransactionTemplate tx, ObjectMapper mapper,
            @Value("${tourny.push.enabled:true}") boolean enabled,
            @Value("${tourny.push.url:https://exp.host/--/api/v2/push/send}") String url,
            @Value("${tourny.push.access-token:}") String accessToken) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.mapper = mapper;
        this.enabled = enabled;
        this.url = url;
        this.accessToken = accessToken;
        this.client = RestClient.builder()
                .requestFactory(new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()))
                .build();
    }

    @Scheduled(fixedDelayString = "${tourny.push.interval-ms:2000}", initialDelayString = "${tourny.push.interval-ms:2000}")
    void tick() {
        if (!enabled) return;
        try {
            int sent;
            do {
                sent = Boolean.TRUE.equals(tx.execute(status -> sendOne())) ? 1 : 0;
            } while (sent > 0);
            jdbc.sql("DELETE FROM public.push_outbox WHERE sent_at < now() - interval '7 days'").update();
        } catch (RuntimeException e) {
            log.warn("push dispatch failed: {}", e.toString());
        }
    }

    /** Claims and sends one queued message; false when the queue is empty. */
    private boolean sendOne() {
        var rows = jdbc.sql("""
                SELECT id, title, body, data::text AS data, attempts
                FROM public.push_outbox WHERE sent_at IS NULL AND attempts < ?
                ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED""").param(MAX_ATTEMPTS).query().listOfRows();
        if (rows.isEmpty()) return false;
        return deliver(rows.get(0));
    }

    private boolean deliver(Map<String, Object> row) {
        long id = ((Number) row.get("id")).longValue();
        try {
            // People (by account) and followers (by device token), each device once.
            List<String> tokens = jdbc.sql("SELECT DISTINCT pt.token FROM public.push_tokens pt JOIN public.push_outbox o ON o.id = ? WHERE pt.user_id = ANY (o.user_ids) OR pt.token = ANY (o.tokens)")
                    .param(id).query(String.class).list();
            JsonNode data = mapper.readTree((String) row.get("data"));
            for (int from = 0; from < tokens.size(); from += EXPO_BATCH) {
                var batch = tokens.subList(from, Math.min(tokens.size(), from + EXPO_BATCH));
                var messages = new ArrayList<Map<String, Object>>();
                for (String token : batch) {
                    messages.add(Map.of("to", token, "title", row.get("title"), "body", row.get("body"), "data", data, "sound", "default", "channelId", "default"));
                }
                var request = client.post().uri(url).contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON);
                if (!accessToken.isBlank()) request = request.header("Authorization", "Bearer " + accessToken);
                String body = request.body(messages).retrieve().body(String.class);
                dropDeadTokens(batch, mapper.readTree(body));
            }
            jdbc.sql("UPDATE public.push_outbox SET sent_at = now(), attempts = attempts + 1 WHERE id = ?").param(id).update();
        } catch (Exception e) {
            log.warn("push {} not delivered (attempt {}): {}", id, row.get("attempts"), e.toString());
            // Give up after MAX_ATTEMPTS so one bad message cannot block the queue forever.
            jdbc.sql("UPDATE public.push_outbox SET attempts = attempts + 1 WHERE id = ?").param(id).update();
        }
        return true;
    }

    /** Expo reports tokens of uninstalled apps; forget them so they are not sent to again. */
    private void dropDeadTokens(List<String> batch, JsonNode response) {
        JsonNode tickets = response.path("data");
        for (int i = 0; i < batch.size() && i < tickets.size(); i++) {
            JsonNode ticket = tickets.get(i);
            if ("error".equals(ticket.path("status").asString()) && "DeviceNotRegistered".equals(ticket.path("details").path("error").asString())) {
                jdbc.sql("DELETE FROM public.push_tokens WHERE token = ?").param(batch.get(i)).update();
            }
        }
    }
}
