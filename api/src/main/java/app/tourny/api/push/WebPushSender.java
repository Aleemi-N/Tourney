package app.tourny.api.push;

import java.security.Security;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Sends one Web Push message (encrypted and VAPID-signed) to a browser subscription. Disabled, with a single log line,
 * until a VAPID key pair is configured (see deploy/make-vapid-keys.mjs).
 */
@Component
class WebPushSender {

    private static final Logger log = LoggerFactory.getLogger(WebPushSender.class);

    /** What happened to a send. GONE means the browser unsubscribed, so the subscription should be forgotten. */
    enum Result { SENT, GONE, FAILED, DISABLED }

    private final PushService service;

    WebPushSender(@Value("${tourny.push.vapid.public-key:}") String publicKey, @Value("${tourny.push.vapid.private-key:}") String privateKey,
            @Value("${tourny.push.vapid.subject:mailto:admin@localhost}") String subject) throws Exception {
        if (publicKey.isBlank() || privateKey.isBlank()) {
            log.info("Web push is off: set TOURNY_VAPID_PUBLIC_KEY and TOURNY_VAPID_PRIVATE_KEY to turn it on");
            this.service = null;
            return;
        }
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) Security.addProvider(new BouncyCastleProvider());
        this.service = new PushService(publicKey, privateKey, subject);
    }

    boolean enabled() {
        return service != null;
    }

    Result send(String endpoint, String p256dh, String auth, String payloadJson) {
        if (service == null) return Result.DISABLED;
        try {
            var response = service.send(new Notification(new Subscription(endpoint, new Subscription.Keys(p256dh, auth)), payloadJson), Encoding.AES128GCM);
            int status = response.getStatusLine().getStatusCode();
            if (status == 404 || status == 410) return Result.GONE;
            if (status >= 200 && status < 300) return Result.SENT;
            log.warn("web push to {} answered {}", host(endpoint), status);
            return Result.FAILED;
        } catch (Exception e) {
            log.warn("web push to {} failed: {}", host(endpoint), e.toString());
            return Result.FAILED;
        }
    }

    private static String host(String endpoint) {
        try {
            return java.net.URI.create(endpoint).getHost();
        } catch (RuntimeException e) {
            return "endpoint";
        }
    }
}
