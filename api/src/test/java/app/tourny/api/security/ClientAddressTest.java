package app.tourny.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientAddressTest {

    private static MockHttpServletRequest request(String peer, String cfHeader) {
        var r = new MockHttpServletRequest();
        r.setRemoteAddr(peer);
        if (cfHeader != null) r.addHeader("CF-Connecting-IP", cfHeader);
        return r;
    }

    @Test
    void behindCloudflareTheVisitorsAddressIsUsed() {
        assertEquals("203.0.113.7", ClientAddress.of(request("172.67.145.238", "203.0.113.7")));
        assertEquals("2001:db8::1", ClientAddress.of(request("2606:4700:10::6816:1", "2001:db8::1")));
    }

    @Test
    void theHeaderIsIgnoredWhenTheRequestDidNotComeFromCloudflare() {
        // Anyone can send the header straight to the server; only Cloudflare's own addresses are believed.
        assertEquals("198.51.100.9", ClientAddress.of(request("198.51.100.9", "203.0.113.7")));
        assertEquals("127.0.0.1", ClientAddress.of(request("127.0.0.1", "203.0.113.7")));
        assertEquals("172.67.145.238", ClientAddress.of(request("172.67.145.238", null)));
    }

    @Test
    void cloudflareRangesAreMatchedExactly() {
        assertTrue(ClientAddress.fromCloudflare("104.16.0.1"));
        assertTrue(ClientAddress.fromCloudflare("104.23.255.255")); // last address of 104.16.0.0/13
        assertFalse(ClientAddress.fromCloudflare("104.32.0.0")); // just past 104.24.0.0/14
        assertFalse(ClientAddress.fromCloudflare("10.0.0.1"));
        assertFalse(ClientAddress.fromCloudflare("not-an-ip"));
    }
}
