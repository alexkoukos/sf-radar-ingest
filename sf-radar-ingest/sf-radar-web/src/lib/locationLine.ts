// Re-export shim. The implementation lives in api/_lib/locationLine.ts so the
// Vercel serverless functions (which cannot reliably import across the
// src/ boundary under "type": "module") can share it. The client imports
// it from here via Vite, which resolves across the repo without issue.
export * from "../../api/_lib/locationLine";
