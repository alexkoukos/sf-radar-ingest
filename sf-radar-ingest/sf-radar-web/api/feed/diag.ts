import type { VercelRequest, VercelResponse } from "@vercel/node";
import { planFeedIcs } from "../../src/lib/planFeed";
import { possessivePhrase } from "../../src/lib/possessive";

// DIAGNOSTIC (temporary). Imports the EXACT cross-directory graph the feed
// function uses (../../src/lib/planFeed -> ics -> categoryLabels/locationLine,
// and ../../src/lib/possessive). If GET /api/feed/diag returns JSON, Vercel
// bundles those imports fine and the feed bug is in [slug].ts's own
// execution path. If it 500s with FUNCTION_INVOCATION_FAILED, the
// cross-directory src/ import is what's breaking the feed.
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({
    node: process.version,
    planFeedIcsEmptyStatus: planFeedIcs([]).status, // expect 404
    possessive: possessivePhrase("Alekos", "SF Radar plan"), // expect "Alekos’ SF Radar plan"
  });
}
