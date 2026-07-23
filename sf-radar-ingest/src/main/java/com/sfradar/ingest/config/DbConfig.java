package com.sfradar.ingest.config;

/**
 * Postgres connection settings, read from the environment rather than
 * luma-sources.json since credentials shouldn't live in a checked-in
 * resource file.
 */
public record DbConfig(String jdbcUrl, String user, String password) {

    public static DbConfig fromEnv() {
        String jdbcUrl = System.getenv("SFRADAR_DB_URL");
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            throw new IllegalStateException("SFRADAR_DB_URL environment variable is not set");
        }
        return new DbConfig(jdbcUrl, System.getenv("SFRADAR_DB_USER"), System.getenv("SFRADAR_DB_PASSWORD"));
    }
}
