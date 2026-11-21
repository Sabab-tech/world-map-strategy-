import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { GitHubAppClient } from "./github-app.js";
import { GeminiGitHubAgent } from "./agent.js";
import { createReplayGuard, verifyActionToken } from "./approvals.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const required = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_INSTALLATION_ID",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "GEMINI_API_KEY",
  "OMEGA_AGENT_ACCESS_TOKEN",
  "OMEGA_ACTION_SIGNING_SECRET"
];
const missing = required.filter(name => !String(process.env[name] || "").trim());
if (missing.length) {
  throw new Error("Missing required environment variables: " + missing.join(", "));
}
if (Buffer.byteLength(process.env.OMEGA_AGENT_ACCESS_TOKEN) < 32) {
  throw new Error("OMEGA_AGENT_ACCESS_TOKEN must contain at least 32 bytes.");
}
if (Buffer.byteLength(process.env.OMEGA_ACTION_SIGNING_SECRET) < 32) {
  throw new Error("OMEGA_ACTION_SIGNING_SECRET must contain at least 32 bytes.");
}

const github = new GitHubAppClient({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
  installationId: process.env.GITHUB_INSTALLATION_ID,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO
});

const agent = new GeminiGitHubAgent({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  github,
  actionSecret: process.env.OMEGA_ACTION_SIGNING_SECRET
});

const app = express();
const replayGuard = createReplayGuard();
const rateBuckets = new Map();
const accessToken = process.env.OMEGA_AGENT_ACCESS_TOKEN;
const actionSecret = process.env.OMEGA_ACTION_SIGNING_SECRET;
const allowedOrigins = new Set(
  String(process.env.AGENT_ALLOWED_ORIGINS || "")
    .split(",").map(value => value.trim()).filter(Boolean)
);

app.disable("x-powered-by");
app.use(express.json({ limit: "1200kb", strict: true }));
app.use(corsPolicy);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  next();
});

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function originAllowed(req) {
  const origin = req.get("origin");
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  const protocol = String(req.get("x-forwarded-proto") || req.protocol || "https")
    .split(",")[0].trim();
  const host = String(req.get("host") || "");
  return origin === protocol + "://" + host;
}

function corsPolicy(req, res, next) {
  const origin = req.get("origin");
  if (origin && !originAllowed(req)) {
    return res.status(403).json({ ok: false, error: "ORIGIN_NOT_ALLOWED" });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
}

function requireOrigin(req, res, next) {
  if (!originAllowed(req)) return res.status(403).json({ ok: false, error: "ORIGIN_NOT_ALLOWED" });
  return next();
}

function requireAgentToken(req, res, next) {
  const header = String(req.get("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !constantTimeEqual(token, accessToken)) {
    return res.status(401).json({ ok: false, error: "AUTHENTICATION_REQUIRED" });
  }
  return next();
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = String(req.ip || req.socket?.remoteAddress || "unknown");
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + 60_000 };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 2000) {
    for (const [candidate, entry] of rateBuckets) {
      if (entry.resetAt <= now) rateBuckets.delete(candidate);
    }
  }
  if (bucket.count > 60) return res.status(429).json({ ok: false, error: "RATE_LIMITED" });
  return next();
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "omega-github-pr-agent" }));
app.use("/api", rateLimit, requireOrigin, requireAgentToken);

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    repository: process.env.GITHUB_OWNER + "/" + process.env.GITHUB_REPO,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    capabilities: [
      "read_pull_requests",
      "read_pr_files_and_patches",
      "read_pr_reviews",
      "read_pr_checks_and_actions",
      "read_repository_files",
      "prepare_approved_pr_commits",
      "prepare_approved_pr_comments",
      "prepare_approved_pr_reviews"
    ],
    writePolicy: {
      humanApprovalRequired: true,
      directMainPush: false,
      merge: false,
      forcePush: false,
      fileDeletion: false,
      forkBranchWrites: false
    }
  });
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const history = req.body?.history === undefined ? [] : req.body.history;
    if (!prompt || prompt.length > 10000) {
      return res.status(400).json({ ok: false, error: "PROMPT_INVALID" });
    }
    if (!Array.isArray(history) || history.length > 16) {
      return res.status(400).json({ ok: false, error: "CONVERSATION_HISTORY_INVALID" });
    }
    const result = await agent.chat(prompt, history);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/actions/execute", async (req, res, next) => {
  try {
    const token = String(req.body?.actionToken || "");
    const action = verifyActionToken(token, actionSecret);
    if (!replayGuard.reserve(action.nonce, action.exp)) {
      return res.status(409).json({ ok: false, error: "ACTION_ALREADY_USED_OR_RUNNING" });
    }
    // Consume the approval before the external write. A network failure can have an
    // ambiguous outcome, so the same token must never be retried as a second write.
    if (!replayGuard.commit(action.nonce)) {
      return res.status(409).json({ ok: false, error: "ACTION_APPROVAL_COMMIT_FAILED" });
    }

    try {
      let result;
      switch (action.action) {
        case "commit_pr_files": {
          const args = action.args;
          result = await github.commitPullRequestFiles(
            args.prNumber,
            args.expectedHeadSha,
            args.files,
            args.commitMessage
          );
          break;
        }
        case "post_pr_comment": {
          const args = action.args;
          const posted = await github.postPullRequestComment(args.prNumber, args.comment, action.nonce);
          result = { commentId: posted?.id || null, url: posted?.html_url || null, alreadyApplied: posted?.alreadyApplied === true };
          break;
        }
        case "submit_pr_review": {
          const args = action.args;
          const submitted = await github.submitPullRequestReview(
            args.prNumber,
            args.event,
            args.body,
            action.nonce
          );
          result = {
            reviewId: submitted?.id || null,
            state: submitted?.state || args.event,
            url: submitted?.html_url || null,
            alreadyApplied: submitted?.alreadyApplied === true
          };
          break;
        }
        default:
          return res.status(400).json({ ok: false, error: "ACTION_NOT_SUPPORTED" });
      }

      return res.json({ ok: true, action: action.action, result });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    if (error?.message === "ACTION_TOKEN_INVALID" ||
        error?.message === "ACTION_TOKEN_EXPIRED_OR_INVALID") {
      return res.status(401).json({ ok: false, error: error.message });
    }
    if (error?.message === "ACTION_ALREADY_USED") {
      return res.status(409).json({ ok: false, error: error.message });
    }
    return next(error);
  }
});

app.use(express.static(path.join(directory, "public"), {
  index: "index.html",
  dotfiles: "deny",
  fallthrough: true,
  etag: false,
  maxAge: 0
}));

app.use((error, _req, res, _next) => {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600
    ? Number(error.status) : 500;
  const code = String(error?.message || "INTERNAL_SERVER_ERROR").slice(0, 300);
  if (status >= 500) console.error("[OMEGA PR Agent]", code);
  return res.status(status).json({ ok: false, error: code });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  console.log("[OMEGA PR Agent] listening on " + port);
  console.log("[OMEGA PR Agent] repository: " +
    process.env.GITHUB_OWNER + "/" + process.env.GITHUB_REPO);
});

export { app, github, agent };
