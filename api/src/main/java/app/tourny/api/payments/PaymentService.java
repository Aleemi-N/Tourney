package app.tourny.api.payments;

import app.tourny.api.payments.RazorpayClient.RazorpayException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

/**
 * Registration fees through the organizer's own Razorpay account. A payer asks for a hosted payment link; the page they
 * pay on belongs to Razorpay. The result is read back from Razorpay (when the payer returns, and every minute for open
 * links), so no webhook has to be set up. Secrets are stored encrypted and never leave this class.
 */
@Service
class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
    private static final Pattern KEY_ID = Pattern.compile("^rzp_(test|live)_[A-Za-z0-9]{6,40}$");
    private static final Pattern KEY_SECRET = Pattern.compile("^[A-Za-z0-9]{10,100}$");
    private static final long LINK_LIFETIME_SECONDS = 24 * 3600;

    static class PaymentException extends RuntimeException {
        final int status;

        PaymentException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final SecretBox secrets;
    private final RazorpayClient razorpay;
    private final String siteUrl;

    PaymentService(JdbcClient jdbc, TransactionTemplate tx, SecretBox secrets, RazorpayClient razorpay, @Value("${tourny.site-url:http://localhost:3000}") String siteUrl) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.secrets = secrets;
        this.razorpay = razorpay;
        this.siteUrl = siteUrl.replaceAll("/+$", "");
    }

    // ── permissions ──────────────────────────────────────────────────────────────────────────────────────────────

    /** Runs a query as the signed-in user, so the database's own organizer check (auth.uid()) applies. */
    private boolean isOrganizer(UUID user, UUID tournament) {
        return Boolean.TRUE.equals(tx.execute((status) -> {
            jdbc.sql("SELECT set_config('request.jwt.claims', ?, true), set_config('request.jwt.claim.sub', ?, true)")
                    .param("{\"sub\":\"" + user + "\",\"role\":\"authenticated\"}").param(user.toString()).query().listOfRows();
            return jdbc.sql("SELECT public.is_tournament_organizer(?)").param(tournament).query(Boolean.class).single();
        }));
    }

    private void requireOrganizer(UUID user, UUID tournament) {
        if (!isOrganizer(user, tournament)) throw new PaymentException(403, "Only an organizer of this tournament can do that");
    }

    private record Registration(UUID tournamentId, UUID userId, String label, String status) {}

    private Registration registration(String kind, UUID id) {
        if (!"PLAYER".equals(kind) && !"TEAM".equals(kind)) throw new PaymentException(400, "Unknown registration type");
        return jdbc.sql("SELECT tournament_id, user_id, label, status FROM public.registration_owner(?, ?)").param(kind).param(id)
                .query((rs, n) -> new Registration(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4))).optional()
                .orElseThrow(() -> new PaymentException(404, "Registration not found"));
    }

    // ── the organizer's account ──────────────────────────────────────────────────────────────────────────────────

    private static String mask(String keyId) {
        return keyId.substring(0, keyId.lastIndexOf('_') + 1) + "••••" + keyId.substring(keyId.length() - 4);
    }

    Map<String, Object> account(UUID user, UUID tournament) {
        requireOrganizer(user, tournament);
        var row = jdbc.sql("SELECT key_id, mode FROM public.tournament_payment_accounts WHERE tournament_id = ?").param(tournament).query().listOfRows();
        if (row.isEmpty()) return Map.of("connected", false, "encryptionReady", secrets.enabled());
        return Map.of("connected", true, "mode", row.get(0).get("mode"), "keyId", mask((String) row.get(0).get("key_id")), "encryptionReady", secrets.enabled());
    }

    Map<String, Object> connect(UUID user, UUID tournament, String keyId, String keySecret) {
        requireOrganizer(user, tournament);
        if (!secrets.enabled()) throw new PaymentException(503, "Online payments are not set up on this server yet");
        if (keyId == null || !KEY_ID.matcher(keyId.trim()).matches()) throw new PaymentException(400, "The Key ID should look like rzp_test_xxxxxxxxxx or rzp_live_xxxxxxxxxx");
        if (keySecret == null || !KEY_SECRET.matcher(keySecret.trim()).matches()) throw new PaymentException(400, "The Key Secret is not valid");
        keyId = keyId.trim();
        keySecret = keySecret.trim();
        try {
            razorpay.validate(keyId, keySecret);
        } catch (RazorpayException e) {
            throw new PaymentException(e.status == 401 ? 400 : 502, e.status == 401 ? "Razorpay did not accept these keys" : e.getMessage());
        }
        String mode = keyId.startsWith("rzp_live_") ? "live" : "test";
        jdbc.sql("""
                INSERT INTO public.tournament_payment_accounts (tournament_id, key_id, key_secret_enc, mode, connected_by) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (tournament_id) DO UPDATE SET key_id = EXCLUDED.key_id, key_secret_enc = EXCLUDED.key_secret_enc, mode = EXCLUDED.mode, connected_by = EXCLUDED.connected_by, connected_at = now()""")
                .param(tournament).param(keyId).param(secrets.encrypt(keySecret)).param(mode).param(user).update();
        return Map.of("connected", true, "mode", mode, "keyId", mask(keyId), "encryptionReady", true);
    }

    Map<String, Object> disconnect(UUID user, UUID tournament) {
        requireOrganizer(user, tournament);
        jdbc.sql("DELETE FROM public.tournament_payment_accounts WHERE tournament_id = ?").param(tournament).update();
        // Links that are still open can no longer be checked, so close them in the records.
        jdbc.sql("UPDATE public.registration_payments SET status = 'CANCELLED', updated_at = now() WHERE tournament_id = ? AND status = 'CREATED'").param(tournament).update();
        return Map.of("connected", false, "encryptionReady", secrets.enabled());
    }

    private record Keys(String keyId, String secret) {}

    private Keys keys(UUID tournament) {
        var rows = jdbc.sql("SELECT key_id, key_secret_enc FROM public.tournament_payment_accounts WHERE tournament_id = ?").param(tournament).query().listOfRows();
        if (rows.isEmpty()) return null;
        return new Keys((String) rows.get(0).get("key_id"), secrets.decrypt((String) rows.get(0).get("key_secret_enc")));
    }

    // ── paying ───────────────────────────────────────────────────────────────────────────────────────────────────

    Map<String, Object> pay(UUID user, String kind, UUID registrationId) {
        Registration reg = registration(kind, registrationId);
        if (!user.equals(reg.userId())) throw new PaymentException(403, "This is not your registration");
        if (!List.of("PENDING", "CHANGES_REQUESTED").contains(reg.status())) throw new PaymentException(409, "This registration no longer needs a payment");
        BigDecimal fee = jdbc.sql("SELECT public.registration_fee(?, ?)").param(reg.tournamentId()).param(kind).query(BigDecimal.class).single();
        if (fee.signum() <= 0) throw new PaymentException(409, "This registration has no fee");
        if (Boolean.TRUE.equals(jdbc.sql("SELECT public.registration_settled(?, ?, ?)").param(kind).param(registrationId).param(reg.tournamentId()).query(Boolean.class).single())) {
            throw new PaymentException(409, "The fee is already paid");
        }
        if (Boolean.TRUE.equals(jdbc.sql("SELECT public.registration_waitlisted(?, ?)").param(kind).param(registrationId).query(Boolean.class).single())) {
            throw new PaymentException(409, "You are on the waitlist. You can pay when a place opens up.");
        }
        Keys keys = keys(reg.tournamentId());
        if (keys == null) throw new PaymentException(409, "The organizer takes this fee offline. Pay them directly and they will mark you as paid.");

        // Reuse the link that is still open, so a second tap does not make a second payment page.
        var open = jdbc.sql("SELECT id, short_url FROM public.registration_payments WHERE kind = ? AND registration_id = ? AND status = 'CREATED' AND provider = 'RAZORPAY' AND created_at > now() - interval '23 hours' ORDER BY created_at DESC LIMIT 1")
                .param(kind).param(registrationId).query().listOfRows();
        if (!open.isEmpty() && open.get(0).get("short_url") != null) {
            return Map.of("paymentId", open.get(0).get("id").toString(), "shortUrl", open.get(0).get("short_url"), "amount", fee);
        }

        UUID paymentId = UUID.randomUUID();
        jdbc.sql("INSERT INTO public.registration_payments (id, tournament_id, kind, registration_id, payer_user_id, amount, provider, created_by) VALUES (?, ?, ?, ?, ?, ?, 'RAZORPAY', ?)")
                .param(paymentId).param(reg.tournamentId()).param(kind).param(registrationId).param(user).param(fee).param(user).update();
        try {
            String tournamentName = jdbc.sql("SELECT name FROM public.tournaments WHERE id = ?").param(reg.tournamentId()).query(String.class).single();
            var who = jdbc.sql("SELECT full_name, email FROM public.profiles WHERE id = ?").param(user).query().listOfRows();
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("amount", fee.movePointRight(2).longValueExact());
            request.put("currency", "INR");
            request.put("accept_partial", false);
            request.put("description", ("PLAYER".equals(kind) ? "Player registration" : "Team registration") + ": " + tournamentName);
            request.put("reference_id", paymentId.toString());
            request.put("expire_by", Instant.now().getEpochSecond() + LINK_LIFETIME_SECONDS);
            request.put("callback_url", siteUrl + "/pay/done");
            request.put("callback_method", "get");
            request.put("notify", Map.of("sms", false, "email", false));
            if (!who.isEmpty() && who.get(0).get("email") != null) {
                Map<String, Object> customer = new LinkedHashMap<>();
                if (who.get(0).get("full_name") != null) customer.put("name", who.get(0).get("full_name"));
                customer.put("email", who.get(0).get("email"));
                request.put("customer", customer);
            }
            JsonNode link = razorpay.createLink(keys.keyId(), keys.secret(), request);
            String linkId = link.path("id").asString();
            String shortUrl = link.path("short_url").asString();
            if (linkId.isBlank() || shortUrl.isBlank()) throw new RazorpayException(502, "Razorpay did not return a payment page");
            jdbc.sql("UPDATE public.registration_payments SET provider_link_id = ?, short_url = ?, updated_at = now() WHERE id = ?").param(linkId).param(shortUrl).param(paymentId).update();
            return Map.of("paymentId", paymentId.toString(), "shortUrl", shortUrl, "amount", fee);
        } catch (RuntimeException e) {
            jdbc.sql("UPDATE public.registration_payments SET status = 'CANCELLED', updated_at = now() WHERE id = ?").param(paymentId).update();
            if (e instanceof RazorpayException r) throw new PaymentException(502, "Razorpay could not create the payment page: " + r.getMessage());
            throw e;
        }
    }

    /** Reads the link's state back from Razorpay and records it. Returns the resulting status of the payment row. */
    private String reconcile(UUID paymentId, UUID tournament, String linkId) {
        Keys keys = keys(tournament);
        if (keys == null) return "CREATED";
        JsonNode link;
        try {
            link = razorpay.getLink(keys.keyId(), keys.secret(), linkId);
        } catch (RazorpayException e) {
            log.warn("could not read payment link {}: {}", linkId, e.getMessage());
            return "CREATED";
        }
        switch (link.path("status").asString("")) {
            case "paid" -> {
                String paymentRef = link.path("payments").path(0).path("payment_id").asString(null);
                jdbc.sql("UPDATE public.registration_payments SET status = 'PAID', paid_at = now(), provider_payment_id = ?, updated_at = now() WHERE id = ? AND status = 'CREATED'").param(paymentRef).param(paymentId).update();
                return "PAID";
            }
            case "expired" -> jdbc.sql("UPDATE public.registration_payments SET status = 'EXPIRED', updated_at = now() WHERE id = ? AND status = 'CREATED'").param(paymentId).update();
            case "cancelled" -> jdbc.sql("UPDATE public.registration_payments SET status = 'CANCELLED', updated_at = now() WHERE id = ? AND status = 'CREATED'").param(paymentId).update();
            default -> { }
        }
        return jdbc.sql("SELECT status FROM public.registration_payments WHERE id = ?").param(paymentId).query(String.class).single();
    }

    /** The payer (or an organizer) asks where the fee stands; an open link is checked with Razorpay first. */
    Map<String, Object> status(UUID user, String kind, UUID registrationId) {
        Registration reg = registration(kind, registrationId);
        if (!user.equals(reg.userId()) && !isOrganizer(user, reg.tournamentId())) throw new PaymentException(403, "Not allowed");
        var rows = jdbc.sql("SELECT id, status, provider_link_id, amount FROM public.registration_payments WHERE kind = ? AND registration_id = ? ORDER BY created_at DESC LIMIT 1").param(kind).param(registrationId).query().listOfRows();
        if (rows.isEmpty()) return Map.of("status", "DUE", "paid", false);
        String state = (String) rows.get(0).get("status");
        if ("CREATED".equals(state) && rows.get(0).get("provider_link_id") != null) {
            state = reconcile((UUID) rows.get(0).get("id"), reg.tournamentId(), (String) rows.get(0).get("provider_link_id"));
        }
        boolean paid = List.of("PAID", "WAIVED", "PARTIALLY_REFUNDED").contains(state);
        return Map.of("status", state, "paid", paid, "amount", rows.get(0).get("amount"));
    }

    // ── refunds ──────────────────────────────────────────────────────────────────────────────────────────────────

    Map<String, Object> refund(UUID user, UUID paymentId, BigDecimal amount) {
        var rows = jdbc.sql("SELECT tournament_id, status, provider, provider_payment_id, amount, refunded_amount FROM public.registration_payments WHERE id = ?").param(paymentId).query().listOfRows();
        if (rows.isEmpty()) throw new PaymentException(404, "Payment not found");
        var p = rows.get(0);
        UUID tournament = (UUID) p.get("tournament_id");
        requireOrganizer(user, tournament);
        if (!"RAZORPAY".equals(p.get("provider"))) throw new PaymentException(409, "This was paid offline. Give the money back yourself.");
        if (!List.of("PAID", "PARTIALLY_REFUNDED").contains((String) p.get("status")) || p.get("provider_payment_id") == null) throw new PaymentException(409, "Only a completed online payment can be refunded");
        BigDecimal paid = (BigDecimal) p.get("amount");
        BigDecimal already = (BigDecimal) p.get("refunded_amount");
        BigDecimal remaining = paid.subtract(already);
        BigDecimal refund = amount == null ? remaining : amount;
        if (refund.signum() <= 0 || refund.compareTo(remaining) > 0) throw new PaymentException(400, "The refund must be more than 0 and at most ₹" + remaining.stripTrailingZeros().toPlainString());
        Keys keys = keys(tournament);
        if (keys == null) throw new PaymentException(409, "Connect the Razorpay account again to refund");
        try {
            razorpay.refund(keys.keyId(), keys.secret(), (String) p.get("provider_payment_id"), refund.movePointRight(2).longValueExact());
        } catch (RazorpayException e) {
            throw new PaymentException(502, "Razorpay could not refund: " + e.getMessage());
        }
        BigDecimal total = already.add(refund);
        String next = total.compareTo(paid) >= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";
        jdbc.sql("UPDATE public.registration_payments SET refunded_amount = ?, status = ?, updated_at = now() WHERE id = ?").param(total).param(next).param(paymentId).update();
        return Map.of("status", next, "refunded", total);
    }

    // ── background check of open links ───────────────────────────────────────────────────────────────────────────

    @Scheduled(fixedDelayString = "${tourny.payments.reconcile-ms:60000}", initialDelayString = "${tourny.payments.reconcile-ms:60000}")
    void reconcileOpenLinks() {
        try {
            var open = jdbc.sql("SELECT id, tournament_id, provider_link_id FROM public.registration_payments WHERE status = 'CREATED' AND provider = 'RAZORPAY' AND provider_link_id IS NOT NULL AND created_at > now() - interval '3 days' ORDER BY created_at LIMIT 50").query().listOfRows();
            for (var row : open) reconcile((UUID) row.get("id"), (UUID) row.get("tournament_id"), (String) row.get("provider_link_id"));
            jdbc.sql("UPDATE public.registration_payments SET status = 'EXPIRED', updated_at = now() WHERE status = 'CREATED' AND created_at < now() - interval '3 days'").update();
        } catch (RuntimeException e) {
            log.warn("payment reconcile failed: {}", e.toString());
        }
    }

    /** Queues the reminders for unpaid fees and for UPI payments waiting on an organizer (the database decides who is due). */
    @Scheduled(fixedDelayString = "${tourny.payments.reminders-ms:1800000}", initialDelayString = "${tourny.payments.reminders-ms:1800000}")
    void sendReminders() {
        try {
            int queued = jdbc.sql("SELECT public.send_payment_reminders()").query(Integer.class).single();
            if (queued > 0) log.info("queued {} payment reminders", queued);
        } catch (RuntimeException e) {
            log.warn("payment reminders failed: {}", e.toString());
        }
    }
}
