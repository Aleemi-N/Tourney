package app.tourny.api.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * Table and view reads and writes keep the PostgREST query language the web app already uses
 * (select=a,b(c), filters, Range, Prefer). The API forwards them to a self-hosted PostgREST with
 * the caller's token, so row-level security and grants decide what each role can do; signed-out
 * visitors get an anon token. Clients call /rest/{table}?...
 */
@RestController
class RestProxyController {

    private static final Set<String> FORWARDED_REQUEST = Set.of(
            "accept", "content-type", "prefer", "range", "accept-profile", "content-profile", "if-none-match");
    private static final Set<String> FORWARDED_RESPONSE = Set.of(
            "content-type", "content-range", "etag", "preference-applied", "location", "content-profile");

    private static final java.util.regex.Pattern TABLE_PATH = java.util.regex.Pattern.compile("/[A-Za-z0-9_]+");

    private final RestClient client;
    private final String baseUrl;
    private final JwtEncoder jwtEncoder;
    private final String apiKey;

    RestProxyController(JwtEncoder jwtEncoder,
                        @Value("${tourny.postgrest.url}") String postgrestUrl,
                        @Value("${tourny.postgrest.api-key:}") String apiKey) {
        // Not RestClient's baseUrl: an absolute request path would replace the /rest prefix.
        this.baseUrl = postgrestUrl.replaceAll("/+$", "");
        this.client = RestClient.builder()
                .requestFactory(new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()))
                .build();
        this.jwtEncoder = jwtEncoder;
        this.apiKey = apiKey;
    }

    @RequestMapping("/rest/**")
    ResponseEntity<byte[]> forward(HttpServletRequest request, @AuthenticationPrincipal Jwt jwt) throws Exception {
        String uri = request.getRequestURI();
        String path = uri.substring("/rest".length());
        // Only tables and views (/rest/<name>). The API root would list the whole schema, and /rest/rpc/* would reach every database
        // function PostgREST knows, around the allow-list that POST /rpc/{function} enforces.
        if (!TABLE_PATH.matcher(path).matches() || path.equals("/rpc")) return ResponseEntity.notFound().build();
        String query = request.getQueryString();
        String token = jwt != null ? jwt.getTokenValue() : anonymousToken();

        var spec = client.method(HttpMethod.valueOf(request.getMethod()))
                .uri(URI.create(baseUrl + path + (query == null ? "" : "?" + query)))
                .headers(h -> {
                    for (String name : FORWARDED_REQUEST) {
                        String value = request.getHeader(name);
                        if (value != null) h.set(name, value);
                    }
                    h.setBearerAuth(token);
                    if (!apiKey.isEmpty()) h.set("apikey", apiKey);
                });
        byte[] body = request.getInputStream().readAllBytes();
        if (body.length > 0) spec = spec.body(body);

        return spec.exchange((req, res) -> {
            HttpHeaders out = new HttpHeaders();
            res.getHeaders().forEach((name, values) -> {
                if (FORWARDED_RESPONSE.contains(name.toLowerCase())) out.put(name, List.copyOf(values));
            });
            return ResponseEntity.status(res.getStatusCode()).headers(out).body(res.getBody().readAllBytes());
        });
    }

    private String anonymousToken() {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuedAt(now).expiresAt(now.plusSeconds(300)).claim("role", "anon").build();
        return jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
