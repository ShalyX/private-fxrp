import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const app = express();
const port = Number(process.env.PORT || 4173);
const proxyUrl = process.env.EXT_PROXY_URL?.replace(/\/+$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "connect-src": ["'self'", "https:", "wss:"],
        "img-src": ["'self'", "data:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"]
      }
    }
  })
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 90,
    standardHeaders: "draft-8",
    legacyHeaders: false
  })
);

async function proxyGet(route, response) {
  if (!proxyUrl) {
    return response.status(503).json({ error: "FCC proxy is not configured" });
  }
  try {
    const upstream = await fetch(`${proxyUrl}${route}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    const body = await upstream.text();
    response
      .status(upstream.status)
      .type(upstream.headers.get("content-type") || "application/json")
      .set("cache-control", "no-store")
      .send(body);
  } catch {
    response.status(502).json({ error: "FCC proxy did not respond" });
  }
}

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    fccProxyConfigured: Boolean(proxyUrl)
  });
});
app.get("/api/tee/info", (_request, response) =>
  proxyGet("/info", response)
);
app.get("/api/tee/action/:id", (request, response) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(request.params.id)) {
    return response.status(400).json({ error: "Invalid FCC action ID" });
  }
  return proxyGet(`/action/result/${request.params.id}`, response);
});

app.use(express.static(path.join(root, "dist"), { index: false }));
app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) {
    return next();
  }
  return response.sendFile(path.join(root, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Private FXRP Access Desk listening on http://0.0.0.0:${port}`);
});
