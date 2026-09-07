package com.sfradar.ingest.util;

/**
 * Dead-simple leveled logging for a batch job whose only sink is a GitHub
 * Actions run log - not a service with a log aggregator, so no SLF4J. INFO
 * goes to stdout, WARN to stderr so anything the pipeline dropped or
 * degraded stands out in the run output instead of scrolling past.
 *
 * <p>Rule for this codebase from the Sept 2026 "missing events" fix: every
 * place an event or a whole target is discarded logs WHY at WARN with
 * enough identity (title + api_id, or the target label) to chase it down.
 * Silent drops are not allowed.
 */
public final class Log {

    private Log() {
    }

    public static void info(String message) {
        System.out.println("INFO  " + message);
    }

    public static void warn(String message) {
        System.err.println("WARN  " + message);
    }

    public static void warn(String message, Throwable cause) {
        System.err.println("WARN  " + message + " - "
            + cause.getClass().getSimpleName() + ": " + cause.getMessage());
    }
}
