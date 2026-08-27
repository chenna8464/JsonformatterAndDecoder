import "dotenv/config";
import express from "express";
import cors from "cors";

export function createServer() {
  const app = express();

  // Security headers & hardening
  app.disable("x-powered-by");

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  /*
   * CORS was `{ origin: true, credentials: true }`, which reflects whatever
   * Origin the caller sends back in Access-Control-Allow-Origin AND sets
   * Allow-Credentials — meaning any website could make credentialed requests
   * to this API and read the responses.
   *
   * Harmless today (the only routes are an unauthenticated ping and demo),
   * but it is exactly the misconfiguration that turns into an account-data
   * leak the moment someone adds an authenticated endpoint. The SPA is served
   * from the same origin as the function, so it needs no CORS at all; this
   * keeps a small allowlist for local development only and never grants
   * credentials.
   */
  const allowedOrigins = [
    "https://jsondesk.com",
    "https://www.jsondesk.com",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin / non-browser callers send no Origin header.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: false,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  // API health ping route
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  return app;
}


