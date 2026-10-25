package app.tourny.api.realtime;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.sql.Connection;
import java.sql.Statement;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Holds one dedicated connection that LISTENs on tourny_changes (see api_notify_change) and hands
 * every notification to the websocket handler. Reconnects with a short backoff if the database
 * connection drops.
 */
@Component
class ChangeListener {

    private static final Logger log = LoggerFactory.getLogger(ChangeListener.class);

    private final DataSource dataSource;
    private final RealtimeHandler handler;
    private final ObjectMapper mapper;
    private volatile boolean running = true;
    private Thread thread;

    ChangeListener(DataSource dataSource, RealtimeHandler handler, ObjectMapper mapper) {
        this.dataSource = dataSource;
        this.handler = handler;
        this.mapper = mapper;
    }

    @PostConstruct
    void start() {
        thread = Thread.ofVirtual().name("change-listener").start(this::run);
    }

    @PreDestroy
    void stop() {
        running = false;
        if (thread != null) thread.interrupt();
    }

    private void run() {
        while (running) {
            try (Connection connection = dataSource.getConnection()) {
                try (Statement statement = connection.createStatement()) {
                    statement.execute("LISTEN tourny_changes");
                }
                PGConnection pg = connection.unwrap(PGConnection.class);
                while (running) {
                    PGNotification[] notifications = pg.getNotifications(5000); // also detects a dead connection
                    if (notifications == null) continue;
                    for (PGNotification n : notifications) {
                        try {
                            handler.dispatch(mapper.readTree(n.getParameter()));
                        } catch (RuntimeException e) {
                            log.warn("Ignoring malformed change notification", e);
                        }
                    }
                }
            } catch (Exception e) {
                if (!running) return;
                log.warn("Change feed connection lost, retrying: {}", e.getMessage());
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException interrupted) {
                    return;
                }
            }
        }
    }
}
