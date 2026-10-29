package app.tourny.api.realtime;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The Phoenix-channel protocol the client speaks, limited to postgres_changes. A client joins a
 * topic with the table filters it wants, gets ids back, and receives a message for every matching
 * change that ChangeListener reports. Both wire formats are supported (1.0.0 objects and the
 * default 2.0.0 arrays). Broadcast and presence are not implemented.
 */
@Component
public class RealtimeHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(RealtimeHandler.class);
    private static final Set<String> TABLES = Set.of("matches", "match_sets", "score_events", "match_timeouts", "auction_public_events", "lot_public_events");

    private record Binding(long id, String event, String table, String filterColumn, String filterValue) {}

    private static final class Subscription {
        final String topic;
        final String joinRef;
        final List<Binding> bindings = new ArrayList<>();
        Subscription(String topic, String joinRef) { this.topic = topic; this.joinRef = joinRef; }
    }

    private final ObjectMapper mapper;
    private final AtomicLong ids = new AtomicLong(1);
    // session id -> its decorated session and its channel subscriptions by topic
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Subscription>> subscriptions = new ConcurrentHashMap<>();

    RealtimeHandler(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // Sends can come from the listener thread and from message handling at once.
        sessions.put(session.getId(), new ConcurrentWebSocketSessionDecorator(session, 5000, 256 * 1024));
        subscriptions.put(session.getId(), new ConcurrentHashMap<>());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        subscriptions.remove(session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession raw, TextMessage message) throws IOException {
        WebSocketSession session = sessions.get(raw.getId());
        if (session == null) return;
        boolean v2 = !"1.0.0".equals(queryParam(raw, "vsn"));
        JsonNode node = mapper.readTree(message.getPayload());
        String joinRef, ref, topic, event;
        JsonNode payload;
        if (v2) { // [join_ref, ref, topic, event, payload]
            joinRef = text(node.get(0)); ref = text(node.get(1)); topic = text(node.get(2)); event = text(node.get(3)); payload = node.get(4);
        } else { // {topic, event, payload, ref}
            joinRef = null; ref = text(node.get("ref")); topic = text(node.get("topic")); event = text(node.get("event")); payload = node.get("payload");
        }
        Map<String, Subscription> mine = subscriptions.get(raw.getId());
        switch (event) {
            case "heartbeat" -> reply(session, v2, joinRef, ref, topic, "ok", mapper.createObjectNode());
            case "phx_join" -> {
                Subscription sub = new Subscription(topic, joinRef);
                ObjectNode response = mapper.createObjectNode();
                var accepted = response.putArray("postgres_changes");
                for (JsonNode f : payload.path("config").path("postgres_changes")) {
                    Binding b = binding(f);
                    if (b == null) { // an unsupported table or filter: refuse the whole join, like Realtime does
                        reply(session, v2, joinRef, ref, topic, "error", error("Unsupported postgres_changes filter"));
                        return;
                    }
                    sub.bindings.add(b);
                    accepted.addObject().put("id", b.id()).put("event", b.event()).put("schema", "public").put("table", b.table())
                            .put("filter", b.filterColumn() == null ? null : b.filterColumn() + "=eq." + b.filterValue());
                }
                mine.put(topic, sub);
                reply(session, v2, joinRef, ref, topic, "ok", response);
                if (!sub.bindings.isEmpty()) {
                    ObjectNode system = mapper.createObjectNode().put("message", "Subscribed to PostgreSQL").put("status", "ok").put("extension", "postgres_changes").put("channel", topic.replaceFirst("^realtime:", ""));
                    push(session, v2, joinRef, topic, "system", system);
                }
            }
            case "phx_leave" -> {
                mine.remove(topic);
                reply(session, v2, joinRef, ref, topic, "ok", mapper.createObjectNode());
            }
            case "access_token" -> reply(session, v2, joinRef, ref, topic, "ok", mapper.createObjectNode());
            default -> { /* presence/broadcast are not supported; ignore */ }
        }
    }

    /** Called by ChangeListener for every row change announced by the database. */
    void dispatch(JsonNode change) {
        String table = text(change.get("table"));
        String type = text(change.get("type"));
        JsonNode record = change.has("record") ? change.get("record") : change.get("old_record");
        subscriptions.forEach((sessionId, topics) -> {
            WebSocketSession session = sessions.get(sessionId);
            if (session == null) return;
            boolean v2 = !"1.0.0".equals(queryParam(session, "vsn"));
            topics.values().forEach(sub -> {
                List<Long> matched = sub.bindings.stream().filter(b -> b.table().equals(table) && (b.event().equals("*") || b.event().equals(type))
                        && (b.filterColumn() == null || b.filterValue().equals(text(record.get(b.filterColumn()))))).map(Binding::id).toList();
                if (matched.isEmpty()) return;
                ObjectNode data = mapper.createObjectNode().put("schema", "public").put("table", table).put("commit_timestamp", java.time.Instant.now().toString()).put("type", type);
                data.putArray("columns"); // no type conversion: JSON values are delivered as they are
                data.set("record", change.has("record") ? change.get("record") : mapper.createObjectNode());
                data.set("old_record", change.has("old_record") ? change.get("old_record") : mapper.createObjectNode());
                data.putNull("errors");
                ObjectNode payload = mapper.createObjectNode();
                payload.putArray("ids").addAll(matched.stream().map(mapper::valueToTree).map(n -> (JsonNode) n).toList());
                payload.set("data", data);
                try {
                    push(session, v2, sub.joinRef, sub.topic, "postgres_changes", payload);
                } catch (IOException e) {
                    log.debug("Dropping realtime message for closed session {}", sessionId);
                }
            });
        });
    }

    private Binding binding(JsonNode f) {
        String table = text(f.get("table"));
        if (!"public".equals(text(f.get("schema"))) || table == null || !TABLES.contains(table)) return null;
        String event = text(f.get("event"));
        if (event == null || !Set.of("*", "INSERT", "UPDATE", "DELETE").contains(event)) return null;
        String filter = text(f.get("filter"));
        if (filter == null || filter.isBlank()) return new Binding(ids.getAndIncrement(), event, table, null, null);
        var m = java.util.regex.Pattern.compile("([a-z_]+)=eq\\.(.+)").matcher(filter);
        return m.matches() ? new Binding(ids.getAndIncrement(), event, table, m.group(1), m.group(2)) : null;
    }

    private void reply(WebSocketSession s, boolean v2, String joinRef, String ref, String topic, String status, JsonNode response) throws IOException {
        ObjectNode payload = mapper.createObjectNode().put("status", status);
        payload.set("response", response);
        send(s, v2, joinRef, ref, topic, "phx_reply", payload);
    }

    private void push(WebSocketSession s, boolean v2, String joinRef, String topic, String event, JsonNode payload) throws IOException {
        send(s, v2, joinRef, null, topic, event, payload);
    }

    private void send(WebSocketSession s, boolean v2, String joinRef, String ref, String topic, String event, JsonNode payload) throws IOException {
        if (!s.isOpen()) return;
        Object frame;
        if (v2) {
            var arr = mapper.createArrayNode();
            arr.add(joinRef).add(ref).add(topic).add(event).add(payload);
            frame = arr;
        } else {
            ObjectNode obj = mapper.createObjectNode().put("topic", topic).put("event", event).put("ref", ref);
            obj.set("payload", payload);
            frame = obj;
        }
        s.sendMessage(new TextMessage(mapper.writeValueAsString(frame)));
    }

    private ObjectNode error(String message) {
        return mapper.createObjectNode().put("reason", message);
    }

    private static String text(JsonNode n) {
        return n == null || n.isNull() ? null : n.asString();
    }

    private static String queryParam(WebSocketSession s, String name) {
        String query = s.getUri() == null ? null : s.getUri().getQuery();
        if (query == null) return null;
        for (String pair : query.split("&")) {
            if (pair.startsWith(name + "=")) return pair.substring(name.length() + 1);
        }
        return null;
    }
}
