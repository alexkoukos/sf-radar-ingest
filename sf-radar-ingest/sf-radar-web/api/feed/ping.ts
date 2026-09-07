import type { VercelRequest, VercelResponse } from "@vercel/node";

// DIAGNOSTIC (temporary). Zero imports from src/. If GET /api/feed/ping
// returns "pong", serverless functions in api/feed/ run at all and the
// res.status/res.send helpers work. If it 500s, the problem is Vercel
// project config (root directory / function detection), not our code.
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).send(`pong ${process.version}`);
}
