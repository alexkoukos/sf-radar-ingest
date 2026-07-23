package com.sfradar.ingest.source.embedded;

/**
 * Thrown when Luma's embedded payload no longer matches the shape this
 * extractor depends on - e.g. the __NEXT_DATA__ tag disappeared, or an
 * event object that matched the signature fields is missing one of them
 * on closer extraction (a contradiction that means the signature itself
 * lied). Always names the specific field or structure that moved, so a
 * future break is diagnosable from the exception message alone rather
 * than surfacing as "zero events, no idea why."
 */
public class NextDataShapeException extends RuntimeException {

    public NextDataShapeException(String message) {
        super(message);
    }

    public NextDataShapeException(String message, Throwable cause) {
        super(message, cause);
    }
}
