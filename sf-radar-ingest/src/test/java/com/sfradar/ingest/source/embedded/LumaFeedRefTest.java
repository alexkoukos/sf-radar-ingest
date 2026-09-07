package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Feed identification is structural only (kind + api_id), so these use small
 * hand-written __NEXT_DATA__ skeletons plus the one real frozen discover
 * fixture - no event payloads involved.
 */
class LumaFeedRefTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void identifiesTheDiscoverFeedFromTheFrozenRealFixture() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/luma-discover-sf-sample.html")) {
            String html = new String(in.readAllBytes());
            JsonNode nextData = new NextDataExtractor(mapper).extract(html);

            Optional<LumaFeedRef> ref = LumaFeedRef.fromNextData(nextData);

            assertTrue(ref.isPresent());
            assertEquals(LumaFeedRef.Kind.DISCOVER_PLACE, ref.get().kind());
            assertEquals("discplace-BDj7GNbGlsF7Cka", ref.get().id());
        }
    }

    @Test
    void identifiesCalendarFeedByDeclaredKind() throws Exception {
        JsonNode nextData = mapper.readTree("""
            {"props":{"pageProps":{"initialData":{
                "kind":"calendar",
                "data":{"calendar":{"api_id":"cal-abc123"}}
            }}}}
            """);

        LumaFeedRef ref = LumaFeedRef.fromNextData(nextData).orElseThrow();

        assertEquals(LumaFeedRef.Kind.CALENDAR, ref.kind());
        assertEquals("cal-abc123", ref.id());
    }

    @Test
    void fallsBackToIdPrefixWhenKindFieldMoved() throws Exception {
        JsonNode nextData = mapper.readTree("""
            {"props":{"pageProps":{"initialData":{
                "data":{"calendar":{"api_id":"cal-xyz"}}
            }}}}
            """);

        LumaFeedRef ref = LumaFeedRef.fromNextData(nextData).orElseThrow();

        assertEquals(LumaFeedRef.Kind.CALENDAR, ref.kind());
        assertEquals("cal-xyz", ref.id());
    }

    @Test
    void returnsEmptyWhenNoFeedIdIsPresent() throws Exception {
        JsonNode nextData = mapper.readTree("""
            {"props":{"pageProps":{"initialData":{"kind":"event","data":{}}}}}
            """);

        assertTrue(LumaFeedRef.fromNextData(nextData).isEmpty());
    }
}
