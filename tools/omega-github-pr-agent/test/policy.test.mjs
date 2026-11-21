import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeRepoPath,
  validateComment,
  validateCommitMessage,
  validateFileEdits,
  validateHeadSha,
  validatePullNumber
} from "../policy.js";

test("accepts normal repository source paths", () => {
  assert.equal(assertSafeRepoPath("src/runtime.js"), "src/runtime.js");
  assert.equal(assertSafeRepoPath("test/runtime.test.mjs"), "test/runtime.test.mjs");
});

test("rejects traversal, absolute paths, secrets and workflow writes", () => {
  for (const value of ["../outside.js", "/etc/passwd", "src/../private.js", ".env",
    "config/.env.production", "certs/app.pem", "private/id_rsa", ".github/workflows/check.yml"]) {
    assert.throws(() => assertSafeRepoPath(value));
  }
});

test("validates additive text edits and rejects duplicates or deletions", () => {
  const valid = validateFileEdits([
    { path: "src/new-file.js", content: "export const ok = true;" },
    { path: "README.md", content: "Updated documentation" }
  ]);
  assert.equal(valid.length, 2);
  assert.throws(() => validateFileEdits([{ path: "a.js", content: "one" }, { path: "a.js", content: "two" }]));
  assert.throws(() => validateFileEdits([{ path: "a.js", content: null }]));
  assert.throws(() => validateFileEdits([]));
  assert.throws(() => validateFileEdits([{ path: "a.js", content: "x", delete: true }]));
});

test("validates bounded comments, commit messages, PR numbers and head SHAs", () => {
  assert.equal(validateComment("  Review note  "), "Review note");
  assert.equal(validateCommitMessage(" fix: correct test "), "fix: correct test");
  assert.equal(validatePullNumber("42"), 42);
  assert.equal(validateHeadSha("a".repeat(40)), "a".repeat(40));
  assert.throws(() => validateComment(" "));
  assert.throws(() => validateCommitMessage(""));
  assert.throws(() => validatePullNumber("0"));
  assert.throws(() => validateHeadSha("not-a-sha"));
});
