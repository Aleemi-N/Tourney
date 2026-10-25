package app.tourny.api.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/** Sends the password-recovery link. Replaceable in tests. */
public interface RecoveryMailer {
    void sendRecoveryLink(String email, String link);
}

/**
 * Uses SMTP when spring.mail.host is configured. Without it, no email can leave the server, so the
 * request is logged (never the link itself, which is a credential).
 */
@Component
class SmtpRecoveryMailer implements RecoveryMailer {

    private static final Logger log = LoggerFactory.getLogger(SmtpRecoveryMailer.class);

    private final ObjectProvider<JavaMailSender> sender;
    private final String from;

    SmtpRecoveryMailer(ObjectProvider<JavaMailSender> sender, @Value("${tourny.mail.from:no-reply@localhost}") String from) {
        this.sender = sender;
        this.from = from;
    }

    @Override
    public void sendRecoveryLink(String email, String link) {
        JavaMailSender mail = sender.getIfAvailable();
        if (mail == null) {
            log.warn("Password recovery requested but no SMTP server is configured (set spring.mail.host)");
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Reset your Tourny password");
        message.setText("Use this link to choose a new password. It works once and expires in one hour.\n\n" + link
                + "\n\nIf you did not ask for this, you can ignore this email.");
        mail.send(message);
    }
}
