package app.tourny.api.security;

import jakarta.servlet.http.HttpServletRequest;
import java.math.BigInteger;
import java.net.InetAddress;
import java.util.List;

/**
 * The visitor's own address, for the per-address limits on sign-in, sign-up and password reset.
 *
 * The website's own server makes many calls for its visitors (sign-in and sign-up are server actions); it passes the visitor's
 * address in X-Tourny-Visitor-IP with a shared key, and only that key makes the header believable.
 *
 * Behind Cloudflare's proxy every request arrives from one of Cloudflare's addresses, and the visitor's is in the
 * CF-Connecting-IP header. That header is believed only when the request really came from Cloudflare: anyone can send it,
 * but only Cloudflare connects from these ranges. Without Cloudflare the header is ignored.
 */
final class ClientAddress {

    // https://www.cloudflare.com/ips/ (ponytail: a fixed copy; Cloudflare changes it rarely, refresh it if they announce new ranges)
    private static final List<String> CLOUDFLARE = List.of(
            "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
            "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
            "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
            "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32");

    private ClientAddress() {}

    /**
     * @param internalKey the key the website's own server sends with the visitor's address (tourny.internal-key); empty
     *                    means nobody's word is taken for it.
     */
    static String of(HttpServletRequest request, String internalKey) {
        String passedOn = request.getHeader("X-Tourny-Visitor-IP");
        String key = request.getHeader("X-Tourny-Internal-Key");
        if (!internalKey.isEmpty() && key != null && passedOn != null && passedOn.length() <= 45 && passedOn.trim().matches("[0-9A-Fa-f:.]+")
                && java.security.MessageDigest.isEqual(key.getBytes(java.nio.charset.StandardCharsets.UTF_8), internalKey.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            return passedOn.trim(); // the website's server, calling on a visitor's behalf
        }
        String peer = request.getRemoteAddr();
        String visitor = request.getHeader("CF-Connecting-IP");
        if (visitor != null && !visitor.isBlank() && fromCloudflare(peer)) return visitor.trim();
        return peer;
    }

    static boolean fromCloudflare(String address) {
        // Java 21 has no literal-only parser; getByName does no lookup for an address literal, and only literals get this far.
        if (address == null || !address.matches("[0-9A-Fa-f:.]+")) return false;
        try {
            InetAddress ip = InetAddress.getByName(address);
            for (String range : CLOUDFLARE) {
                String[] parts = range.split("/");
                InetAddress net = InetAddress.getByName(parts[0]);
                if (net.getAddress().length != ip.getAddress().length) continue;
                int bits = Integer.parseInt(parts[1]);
                int total = ip.getAddress().length * 8;
                BigInteger mask = BigInteger.ONE.shiftLeft(total).subtract(BigInteger.ONE).shiftRight(bits).not();
                if (new BigInteger(1, ip.getAddress()).and(mask).equals(new BigInteger(1, net.getAddress()).and(mask))) return true;
            }
        } catch (java.net.UnknownHostException | IllegalArgumentException e) {
            return false; // not a valid address
        }
        return false;
    }
}
