import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signActionToken(action, args, secret, options = {}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new Error("ACTION_SIGNING_SECRET_TOO_SHORT");
  }
  const now = Number(options.now ?? Date.now());
  const ttlMs = Math.min(Math.max(Number(options.ttlMs ?? 10 * 60 * 1000), 30_000), 15 * 60 * 1000);
  const payload = {
    action: String(action),
    args,
    exp: Math.floor((now + ttlMs) / 1000),
    iat: Math.floor(now / 1000),
    nonce: randomUUID()
  };
  const encoded = encode(payload);
  return encoded + "." + signature(encoded, secret);
}

export function verifyActionToken(token, secret, options = {}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new Error("ACTION_SIGNING_SECRET_TOO_SHORT");
  }
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("ACTION_TOKEN_INVALID");
  const expected = signature(parts[0], secret);
  if (!safeEqual(expected, parts[1])) throw new Error("ACTION_TOKEN_INVALID");

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("ACTION_TOKEN_INVALID");
  }

  const nowSeconds = Math.floor(Number(options.now ?? Date.now()) / 1000);
  if (!payload || typeof payload !== "object" || !payload.action ||
      !payload.args || typeof payload.args !== "object" ||
      !payload.nonce || !Number.isFinite(payload.exp) ||
      payload.exp <= nowSeconds || payload.iat > nowSeconds + 30) {
    throw new Error("ACTION_TOKEN_EXPIRED_OR_INVALID");
  }
  return payload;
}

export function createReplayGuard(options = {}) {
  const used = new Map();
  const reserved = new Map();
  const maxEntries = Number(options.maxEntries || 5000);

  function cleanup(now) {
    const seconds = Math.floor(now / 1000);
    for (const [key, expiry] of used) {
      if (expiry <= seconds) used.delete(key);
    }
    for (const [key, expiry] of reserved) {
      if (expiry <= seconds) reserved.delete(key);
    }
  }

  return {
    reserve(nonce, expiresAtSeconds, now = Date.now()) {
      cleanup(now);
      if (!nonce || used.has(nonce) || reserved.has(nonce)) return false;
      if (used.size + reserved.size >= maxEntries) return false;
      reserved.set(nonce, expiresAtSeconds);
      return true;
    },
    commit(nonce) {
      const expiry = reserved.get(nonce);
      if (!expiry) return false;
      reserved.delete(nonce);
      used.set(nonce, expiry);
      return true;
    },
    release(nonce) {
      return reserved.delete(nonce);
    },
    size() {
      return used.size + reserved.size;
    }
  };
}
