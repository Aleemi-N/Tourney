package app.tourny.api.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;

/** Stateless API: callers log in once and send the access token as a Bearer header. */
@Configuration
class SecurityConfig {

    private final SecretKeySpec key;

    SecurityConfig(@Value("${tourny.jwt.secret}") String secret) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("tourny.jwt.secret must be at least 32 bytes");
        }
        this.key = new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable()) // bearer tokens only, no cookies
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/auth/v1/token", "/auth/v1/signup", "/auth/v1/recover", "/actuator/health", "/realtime/v1/websocket", "/error", "/storage/v1/object/public/**", "/rest/**", "/rpc/**").permitAll() // a token is decoded when sent; the database roles decide what is allowed
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
                .build();
    }

    /** Browser clients (the web app) call the API from their own origin; list them in tourny.cors.origins. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${tourny.cors.origins:}") List<String> origins) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins.stream().filter(o -> !o.isBlank()).toList());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"));
        cors.setAllowedHeaders(List.of("authorization", "apikey", "content-type", "x-client-info", "x-supabase-api-version", "prefer", "range", "accept-profile", "content-profile", "accept", "x-upsert", "cache-control", "if-none-match"));
        cors.setExposedHeaders(List.of("content-range", "content-type", "preference-applied"));
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }

    @Bean
    JwtDecoder jwtDecoder(AccountGuard accounts) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        // A token outlives its account, so a deleted account's token is refused even though it has not expired.
        OAuth2TokenValidator<Jwt> notDeleted = jwt -> {
            UUID user;
            try {
                user = UUID.fromString(jwt.getSubject());
            } catch (RuntimeException e) {
                return OAuth2TokenValidatorResult.success(); // the anonymous key and service keys carry no user
            }
            return accounts.isDeleted(user) ? OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "This account was deleted", null)) : OAuth2TokenValidatorResult.success();
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), notDeleted));
        return decoder;
    }

    @Bean
    JwtEncoder jwtEncoder() {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
