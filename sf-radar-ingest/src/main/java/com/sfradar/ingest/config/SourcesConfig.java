package com.sfradar.ingest.config;

import java.util.List;

/**
 * Deserialized shape of luma-sources.json: which pages to fetch and the
 * User-Agent to identify this bot as when fetching them.
 */
public record SourcesConfig(int version, String userAgent, List<Target> targets) {

    public record Target(String label, String url) {
    }
}
