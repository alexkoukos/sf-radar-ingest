package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Locates and parses the {@code <script id="__NEXT_DATA__" type="application/json">}
 * tag that Luma's Next.js pages embed on every page render (discover pages,
 * community calendar pages, event pages all use it). This is a standard,
 * single self-contained JSON document - not React Server Component streaming
 * chunks - so extraction is a plain substring-and-parse, no reassembly logic.
 *
 * <p>Confirmed against real luma.com/sf and luma.com/calendar/* responses
 * during planning; see src/test/resources/luma-discover-sf-sample.html.
 */
public final class NextDataExtractor {

    private static final String SCRIPT_OPEN_MARKER = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    private static final String SCRIPT_CLOSE_MARKER = "</script>";

    private final ObjectMapper objectMapper;

    public NextDataExtractor(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public JsonNode extract(String html) {
        int start = html.indexOf(SCRIPT_OPEN_MARKER);
        if (start == -1) {
            throw new NextDataShapeException(
                "__NEXT_DATA__ script tag not found - Luma's page structure has likely changed "
                    + "(the tag itself is gone, not just a field inside it)");
        }
        int contentStart = start + SCRIPT_OPEN_MARKER.length();
        int contentEnd = html.indexOf(SCRIPT_CLOSE_MARKER, contentStart);
        if (contentEnd == -1) {
            throw new NextDataShapeException(
                "__NEXT_DATA__ script tag has no closing </script> tag within the fetched document");
        }
        String jsonText = html.substring(contentStart, contentEnd);
        try {
            return objectMapper.readTree(jsonText);
        } catch (Exception e) {
            throw new NextDataShapeException(
                "__NEXT_DATA__ content is not valid JSON - Luma's payload format has likely changed", e);
        }
    }
}
