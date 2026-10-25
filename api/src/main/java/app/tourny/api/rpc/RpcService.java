package app.tourny.api.rpc;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs one allow-listed Postgres function for the signed-in user. The transaction carries the
 * user's id and role the way PostgREST does, so row-level security and auth.uid() behave exactly
 * as they did under Supabase. Arguments are bound as parameters; only names the database itself
 * reports for the function are ever placed in the SQL text.
 */
@Service
public class RpcService {

    private record Overload(List<String> argNames, List<String> argTypes, boolean returnsSet, boolean returnsVoid) {}

    private static final Pattern IDENT = Pattern.compile("[a-z_][a-z0-9_]*");

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final Set<String> allowed;
    private final Map<String, List<Overload>> overloads = new ConcurrentHashMap<>();

    RpcService(JdbcClient jdbc, ObjectMapper mapper, @Value("${tourny.rpc.allowlist}") Resource allowlist) throws Exception {
        this.jdbc = jdbc;
        this.mapper = mapper;
        try (var reader = new BufferedReader(new InputStreamReader(allowlist.getInputStream(), StandardCharsets.UTF_8))) {
            this.allowed = reader.lines().map(String::trim).filter(l -> !l.isEmpty() && !l.startsWith("#")).collect(Collectors.toUnmodifiableSet());
        }
    }

    @Transactional
    public String call(String function, Map<String, Object> args, String userId) {
        if (!IDENT.matcher(function).matches() || !allowed.contains(function)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown function");
        }
        Map<String, Object> input = args == null ? Map.of() : args;
        Overload overload = pick(function, input.keySet());

        // Run as the caller: transaction-local claims and role, reset automatically at commit.
        jdbc.sql("SELECT set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true), set_config('role', :role, true)")
                .param("claims", mapper.writeValueAsString(userId == null ? Map.of("role", "anon") : Map.of("sub", userId, "role", "authenticated")))
                .param("sub", userId == null ? "" : userId).param("role", userId == null ? "anon" : "authenticated").query().singleRow();

        List<String> parts = new ArrayList<>();
        List<String> values = new ArrayList<>();
        for (int i = 0; i < overload.argNames().size(); i++) {
            String name = overload.argNames().get(i);
            if (!input.containsKey(name)) continue;
            String type = overload.argTypes().get(i);
            values.add(mapper.writeValueAsString(input.get(name)));
            parts.add(name + " => " + expression(type));
        }
        String call = "public." + function + "(" + String.join(", ", parts) + ")";
        String sql = overload.returnsVoid() ? "SELECT " + call + "::text AS result"
                : overload.returnsSet() ? "SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text AS result FROM " + call + " t"
                : "SELECT to_jsonb(" + call + ")::text AS result";
        var statement = jdbc.sql(sql);
        for (int i = 0; i < values.size(); i++) statement = statement.param(i + 1, values.get(i));
        Object result = statement.query().singleRow().get("result");
        return result == null ? "null" : result.toString();
    }

    /** One JSON value, cast to the argument's declared type. */
    private static String expression(String type) {
        if (type.equals("jsonb") || type.equals("json")) return "?::" + type;
        if (type.endsWith("[]")) return "ARRAY(SELECT jsonb_array_elements_text(?::jsonb))::" + type;
        return "(?::jsonb #>> '{}')::" + type;
    }

    private Overload pick(String function, Set<String> keys) {
        List<Overload> candidates = overloads.computeIfAbsent(function, this::load);
        return candidates.stream()
                .filter(o -> new HashSet<>(o.argNames()).containsAll(keys))
                .max((a, b) -> Integer.compare(b.argNames().size(), a.argNames().size())) // fewest parameters that fit
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown argument for " + function));
    }

    private List<Overload> load(String function) {
        return jdbc.sql("""
                SELECT p.proretset, p.prorettype = 'void'::regtype AS is_void,
                       COALESCE((SELECT array_agg(p.proargnames[i] ORDER BY i) FROM generate_series(1, p.pronargs) i), '{}') AS names,
                       COALESCE((SELECT array_agg(format_type(p.proargtypes[i - 1], NULL) ORDER BY i) FROM generate_series(1, p.pronargs) i), '{}') AS types
                FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = :name
                """).param("name", function).query((rs, n) -> new Overload(
                        List.of((String[]) rs.getArray("names").getArray()),
                        List.of((String[]) rs.getArray("types").getArray()),
                        rs.getBoolean("proretset"), rs.getBoolean("is_void"))).list();
    }
}
