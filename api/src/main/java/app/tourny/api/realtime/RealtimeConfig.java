package app.tourny.api.realtime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
class RealtimeConfig implements WebSocketConfigurer {

    private final RealtimeHandler handler;
    private final String[] origins;

    RealtimeConfig(RealtimeHandler handler, @Value("${tourny.cors.origins:}") String[] origins) {
        this.handler = handler;
        this.origins = origins;
    }

    /** The path supabase-js connects to ({url}/realtime/v1/websocket). */
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/realtime/v1/websocket").setAllowedOrigins(origins);
    }
}
