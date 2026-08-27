import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";

// Shared Express app factory, used by both the long-running sandbox server
// (server/index.ts, which calls app.listen()) and the Vercel serverless
// function (api/index.ts, which never calls listen() — Vercel's runtime
// handles the HTTP server itself and just invokes the app per-request).
let appPromise: Promise<express.Express> | null = null;

export function getApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = buildApp();
  }
  return appPromise;
}

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

async function buildApp() {
  const app = express();

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args: any[]) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args] as any);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        log(logLine);
      }
    });

    next();
  });

  // registerRoutes wants an http.Server for its signature, but nothing in
  // this app currently uses it (no WebSocket setup) — a throwaway instance
  // that's never listen()'d satisfies the type without side effects.
  const dummyServer = createServer(app);
  await registerRoutes(dummyServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(status).json({ message });
  });

  return app;
}
