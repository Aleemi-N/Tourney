package app.tourny.api.payments;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** The few Razorpay calls Tourny needs, made with the organizer's own key pair. */
@Component
class RazorpayClient {

    /** Razorpay answered with an error (bad keys, invalid request); the message is safe to show. */
    static class RazorpayException extends RuntimeException {
        final int status;

        RazorpayException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private final RestClient client;
    private final ObjectMapper mapper;

    RazorpayClient(ObjectMapper mapper, @Value("${tourny.razorpay.base-url:https://api.razorpay.com/v1}") String baseUrl) {
        this.mapper = mapper;
        // Not RestClient's baseUrl: an absolute request path would replace its path prefix.
        this.client = RestClient.builder().baseUrl(baseUrl)
                .requestFactory(new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()))
                .build();
    }

    private static String basic(String keyId, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString((keyId + ":" + secret).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private JsonNode parse(String body, HttpStatusCode status) {
        try {
            return mapper.readTree(body == null || body.isBlank() ? "{}" : body);
        } catch (RuntimeException e) {
            throw new RazorpayException(status.value(), "Razorpay sent an unreadable answer");
        }
    }

    private JsonNode call(String keyId, String secret, String method, String path, Object body) {
        var spec = client.method(org.springframework.http.HttpMethod.valueOf(method)).uri(path).header("Authorization", basic(keyId, secret)).accept(MediaType.APPLICATION_JSON);
        var exchange = body == null ? spec : spec.contentType(MediaType.APPLICATION_JSON).body(body);
        return exchange.exchange((request, response) -> {
            String text = new String(response.getBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            JsonNode json = parse(text, response.getStatusCode());
            if (response.getStatusCode().isError()) {
                String message = json.path("error").path("description").asString("Razorpay refused the request");
                throw new RazorpayException(response.getStatusCode().value(), message);
            }
            return json;
        });
    }

    /** Checks that the key pair is accepted by Razorpay (a harmless read). */
    void validate(String keyId, String secret) {
        call(keyId, secret, "GET", "/payment_links?count=1", null);
    }

    JsonNode createLink(String keyId, String secret, Map<String, Object> request) {
        return call(keyId, secret, "POST", "/payment_links", request);
    }

    JsonNode getLink(String keyId, String secret, String linkId) {
        return call(keyId, secret, "GET", "/payment_links/" + linkId, null);
    }

    JsonNode refund(String keyId, String secret, String paymentId, long paise) {
        return call(keyId, secret, "POST", "/payments/" + paymentId + "/refund", Map.of("amount", paise));
    }
}
