import test from "node:test";
import assert from "node:assert/strict";
import {
  createReplayGuard,
  signActionToken,
  verifyActionToken
} from "../approvals.js";

const secret = "test-action-signing-secret-32-bytes-minimum";

test("signed actions verify and preserve their exact payload", () => {
  const token = signActionToken("post_pr_comment", { prNumber: 7, comment: "Looks good" }, secret, {
    now: 1_800_000_000_000,
    ttlMs: 60_000
  });
  const payload = verifyActionToken(token, secret, { now: 1_800_000_020_000 });
  assert.equal(payload.action, "post_pr_comment");
  assert.deepEqual(payload.args, { prNumber: 7, comment: "Looks good" });
});

test("tampered and expired approval tokens are rejected", () => {
  const token = signActionToken("commit_pr_files", { prNumber: 3 }, secret, {
    now: 1_800_000_000_000,
    ttlMs: 60_000
  });
  assert.throws(() => verifyActionToken(token + "x", secret, { now: 1_800_000_010_000 }));
  assert.throws(() => verifyActionToken(token, secret, { now: 1_800_000_120_000 }));
});

test("replay guard allows one use and rejects a second use", () => {
  const guard = createReplayGuard();
  assert.equal(guard.consume("nonce-a", 1_900_000_000), true);
  assert.equal(guard.consume("nonce-a", 1_900_000_000), false);
  assert.equal(guard.size(), 1);
});

test("short action secrets are rejected", () => {
  assert.throws(() => signActionToken("x", {}, "short"));
});
