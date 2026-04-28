import "server-only";

type Level = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = new Set([
  "access_token",
  "accesstoken",
  "authorization",
  "webhook_secret",
  "webhooksecret",
  "password",
  "api_key",
  "apikey",
  "secret",
  "token",
  "x-shopify-worker-secret",
  "x-ocr-secret",
  "x-shopify-hmac-sha256",
  "shopify_encryption_key",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
