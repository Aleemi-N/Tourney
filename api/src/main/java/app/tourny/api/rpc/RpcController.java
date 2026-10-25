package app.tourny.api.rpc;

import java.sql.SQLException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RestControllerAdvice
class RpcController {

    private final RpcService rpc;

    RpcController(RpcService rpc) {
        this.rpc = rpc;
    }

    @PostMapping(value = "/rpc/{function}", produces = MediaType.APPLICATION_JSON_VALUE)
    String call(@PathVariable String function, @RequestBody(required = false) Map<String, Object> args, @AuthenticationPrincipal Jwt jwt) {
        return rpc.call(function, args, jwt.getSubject());
    }

    /** Database errors keep the shape clients already handle: {message, code}. */
    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> database(DataAccessException e) {
        Throwable cause = e.getMostSpecificCause();
        String state = cause instanceof SQLException s && s.getSQLState() != null ? s.getSQLState() : "XX000";
        // P0001 is RAISE EXCEPTION: the function refused the request and says why.
        boolean refusal = state.equals("P0001") || state.startsWith("23") || state.startsWith("22");
        HttpStatus status = refusal ? HttpStatus.BAD_REQUEST : state.equals("42501") ? HttpStatus.FORBIDDEN : HttpStatus.INTERNAL_SERVER_ERROR;
        String message = status == HttpStatus.INTERNAL_SERVER_ERROR ? "Internal error" : firstLine(cause.getMessage());
        return ResponseEntity.status(status).body(Map.of("message", message, "code", state));
    }

    private static String firstLine(String text) {
        if (text == null) return "";
        int end = text.indexOf('\n');
        return end < 0 ? text : text.substring(0, end);
    }
}
