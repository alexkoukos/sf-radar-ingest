package com.sfradar.ingest.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SourcesConfigLoaderTest {

    @Test
    void loadsTargetsAndUserAgentFromTheRealResource() {
        SourcesConfig config = new SourcesConfigLoader(new ObjectMapper())
            .loadFromClasspath("/luma-sources.json");

        assertEquals(1, config.version());
        assertTrue(config.userAgent().startsWith("SFRadarBot/1.0"));
        assertEquals(16, config.targets().size());

        SourcesConfig.Target first = config.targets().get(0);
        assertEquals("discover:sf", first.label());
        assertEquals("https://luma.com/sf", first.url());
    }

    @Test
    void throwsWhenResourceIsMissing() {
        SourcesConfigLoader loader = new SourcesConfigLoader(new ObjectMapper());
        assertThrows(IllegalStateException.class, () -> loader.loadFromClasspath("/does-not-exist.json"));
    }
}
