import type { IncomingMessage, ServerResponse } from "node:http";
import { getApp } from "../server/app";

// Vercel serverless entry point. Vercel's Node runtime invokes this default
// export as a plain (req, res) handler for every request under /api/*  —
// it never calls .listen(), so getApp() builds the Express app once (cached
// across warm invocations) and we hand off req/res to it directly.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  (app as any)(req, res);
}
