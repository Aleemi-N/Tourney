package app.tourny.api.security;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * The subset of the GoTrue API that supabase-js and @supabase/ssr call, so web and mobile keep
 * their existing auth code and only change the project URL.
 */
@RestController
@RestControllerAdvice(assignableTypes = AuthController.class)
class AuthController {

    private final AuthService auth;

    AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/auth/v1/token")
    Map<String, Object> token(@RequestParam("grant_type") String grantType, @RequestBody Map<String, Object> body) {
        return switch (grantType) {
            case "password" -> auth.signInWithPassword(text(body, "email"), text(body, "password"));
            case "refresh_token" -> auth.refresh(text(body, "refresh_token"));
            case "pkce" -> auth.exchangeCode(text(body, "auth_code"), text(body, "code_verifier"));
            default -> throw new AuthService.AuthException(400, "unsupported_grant_type", "Unsupported grant_type");
        };
    }

    @PostMapping("/auth/v1/signup")
    Map<String, Object> signUp(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) body.get("data");
        return auth.signUp(text(body, "email"), text(body, "password"), data);
    }

    @GetMapping("/auth/v1/user")
    Map<String, Object> user(@AuthenticationPrincipal Jwt jwt) {
        return auth.getUser(jwt.getSubject());
    }

    @PutMapping("/auth/v1/user")
    Map<String, Object> updateUser(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) body.get("data");
        return auth.updateUser(jwt.getSubject(), (String) body.get("password"), data);
    }

    @PostMapping("/auth/v1/logout")
    ResponseEntity<Void> logout(@AuthenticationPrincipal Jwt jwt) {
        auth.signOut(jwt.getSubject());
        return ResponseEntity.noContent().build();
    }

    /** Always 200, like GoTrue, so the response never reveals whether an email has an account. */
    @PostMapping("/auth/v1/recover")
    Map<String, Object> recover(@RequestBody Map<String, Object> body, @RequestParam(name = "redirect_to", required = false) String redirectTo) {
        auth.recover(text(body, "email"), (String) body.get("code_challenge"), (String) body.get("code_challenge_method"), redirectTo);
        return Map.of();
    }

    private static String text(Map<String, Object> body, String key) {
        Object value = body.get(key);
        if (!(value instanceof String s) || s.isBlank()) {
            throw new AuthService.AuthException(400, "validation_failed", key + " is required");
        }
        return s;
    }

    @ExceptionHandler(AuthService.AuthException.class)
    ResponseEntity<Map<String, Object>> failed(AuthService.AuthException e) {
        return ResponseEntity.status(e.status).body(Map.of("code", e.status, "error_code", e.code, "msg", e.getMessage()));
    }
}
