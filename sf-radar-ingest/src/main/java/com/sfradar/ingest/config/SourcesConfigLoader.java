package com.sfradar.ingest.config;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

public final class SourcesConfigLoader {

    private final ObjectMapper objectMapper;

    public SourcesConfigLoader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public SourcesConfig loadFromClasspath(String resourcePath) {
        try (InputStream in = getClass().getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException("sources config not found on classpath: " + resourcePath);
            }
            return objectMapper.readValue(in, SourcesConfig.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
