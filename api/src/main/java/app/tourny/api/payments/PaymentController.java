package app.tourny.api.payments;

import app.tourny.api.payments.PaymentService.PaymentException;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Registration fees. Every endpoint needs a signed-in user; the service checks who may do what. */
@RestController
@RequestMapping("/payments/v1")
class PaymentController {

    record ConnectRequest(String keyId, String keySecret) {}

    record PayRequest(String kind, UUID registrationId) {}

    record RefundRequest(BigDecimal amount) {}

    private final PaymentService service;

    PaymentController(PaymentService service) {
        this.service = service;
    }

    private static UUID user(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    @GetMapping("/tournaments/{id}/account")
    Map<String, Object> account(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.account(user(jwt), id);
    }

    @PutMapping("/tournaments/{id}/account")
    Map<String, Object> connect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody ConnectRequest body) {
        return service.connect(user(jwt), id, body.keyId(), body.keySecret());
    }

    @DeleteMapping("/tournaments/{id}/account")
    Map<String, Object> disconnect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.disconnect(user(jwt), id);
    }

    @PostMapping("/pay")
    Map<String, Object> pay(@AuthenticationPrincipal Jwt jwt, @RequestBody PayRequest body) {
        return service.pay(user(jwt), body.kind(), body.registrationId());
    }

    @GetMapping("/status")
    Map<String, Object> status(@AuthenticationPrincipal Jwt jwt, @RequestParam String kind, @RequestParam UUID registrationId) {
        return service.status(user(jwt), kind, registrationId);
    }

    @PostMapping("/{paymentId}/refund")
    Map<String, Object> refund(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID paymentId, @RequestBody(required = false) RefundRequest body) {
        return service.refund(user(jwt), paymentId, body == null ? null : body.amount());
    }

    @ExceptionHandler(PaymentException.class)
    ResponseEntity<Map<String, String>> failed(PaymentException e) {
        return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
    }
}
