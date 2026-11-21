import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  createGitHubAppJwt,
  GitHubAppClient,
  githubAppConstants
} from "../github-app.js";

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body
  };
}

function makeClient(fetchImpl) {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    publicKey: pair.publicKey,
    client: new GitHubAppClient({
      appId: "12345",
      privateKey,
      installationId: "98765",
      owner: "Sabab-tech",
      repo: "world-map-strategy-",
      fetchImpl,
      clock: () => 1_800_000_000_000
    })
  };
}

test("GitHub App JWT is RS256 signed and expires within ten minutes", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const token = createGitHubAppJwt("123", privateKey, 1_800_000_000_000);
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const unsigned = parts[0] + "." + parts[1];
  const verifier = createVerify("RSA-SHA256");
  verifier.update(unsigned);
  verifier.end();
  assert.equal(verifier.verify(pair.publicKey, parts[2], "base64url"), true);
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(payload.iss, "123");
  assert.ok(payload.exp - payload.iat <= 600);
});

test("installation token is restricted to one repository and minimum permissions", async () => {
  let requestBody;
  const { client } = makeClient(async (url, options) => {
    assert.match(String(url), /app\/installations\/98765\/access_tokens$/);
    requestBody = JSON.parse(options.body);
    return jsonResponse(201, {
      token: "installation-token",
      expires_at: new Date(1_800_000_000_000 + 3600_000).toISOString()
    });
  });
  const token = await client.installationToken();
  assert.equal(token, "installation-token");
  assert.deepEqual(requestBody.repositories, ["world-map-strategy-"]);
  assert.deepEqual(requestBody.permissions, githubAppConstants.tokenPermissions);
});

test("commits only to the exact open same-repository PR head without force", async () => {
  const head = "a".repeat(40);
  const commitSha = "b".repeat(40);
  const calls = [];
  let currentHead = head;
  const pr = () => ({
    number: 17,
    state: "open",
    head: {
      ref: "feature/fix-production",
      sha: currentHead,
      repo: { full_name: "Sabab-tech/world-map-strategy-" }
    }
  });

  const { client } = makeClient(async (url, options = {}) => {
    const parsed = new URL(String(url));
    const route = parsed.pathname;
    const method = options.method || "GET";
    calls.push({ route, method, body: options.body ? JSON.parse(options.body) : null });

    if (route.endsWith("/access_tokens")) {
      return jsonResponse(201, {
        token: "installation-token",
        expires_at: new Date(1_800_000_000_000 + 3600_000).toISOString()
      });
    }
    if (route.endsWith("/pulls/17") && method === "GET") return jsonResponse(200, pr());
    if (route.endsWith("/git/commits/" + head)) {
      return jsonResponse(200, { tree: { sha: "base-tree" } });
    }
    if (route.endsWith("/git/trees/base-tree") && method === "GET") {
      return jsonResponse(200, {
        truncated: false,
        tree: [{ path: "src/fix.js", type: "blob", mode: "100755" }]
      });
    }
    if (route.endsWith("/git/blobs") && method === "POST") {
      return jsonResponse(201, { sha: "new-blob" });
    }
    if (route.endsWith("/git/trees") && method === "POST") {
      const body = JSON.parse(options.body);
      assert.equal(body.tree[0].mode, "100755");
      return jsonResponse(201, { sha: "new-tree" });
    }
    if (route.endsWith("/git/commits") && method === "POST") {
      return jsonResponse(201, { sha: commitSha });
    }
    if (route.endsWith("/git/refs/heads/feature/fix-production") && method === "PATCH") {
      assert.equal(JSON.parse(options.body).force, false);
      currentHead = commitSha;
      return jsonResponse(200, { object: { sha: commitSha } });
    }
    throw new Error("Unexpected mocked route " + method + " " + route);
  });

  const result = await client.commitPullRequestFiles(
    17,
    head,
    [{ path: "src/fix.js", content: "export const fixed = true;" }],
    "fix: repair PR issue"
  );

  assert.equal(result.updated, true);
  assert.equal(result.currentHeadSha, commitSha);
  assert.deepEqual(result.filesChanged, ["src/fix.js"]);
  assert.equal(calls.some(call => call.method === "PATCH" && call.body?.force === true), false);
});

test("refuses stale-head and fork PR writes before creating Git objects", async () => {
  const head = "a".repeat(40);
  let blobWrites = 0;
  const { client } = makeClient(async (url, options = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/access_tokens")) {
      return jsonResponse(201, {
        token: "installation-token",
        expires_at: new Date(1_800_000_000_000 + 3600_000).toISOString()
      });
    }
    if (parsed.pathname.endsWith("/pulls/18")) {
      return jsonResponse(200, {
        number: 18,
        state: "open",
        head: { ref: "feature/fork", sha: "c".repeat(40), repo: { full_name: "someone/fork" } }
      });
    }
    if (parsed.pathname.endsWith("/git/blobs")) blobWrites += 1;
    throw new Error("Unexpected route " + parsed.pathname);
  });

  await assert.rejects(
    client.commitPullRequestFiles(18, head, [{ path: "fix.js", content: "x" }], "fix"),
    /FORK_BRANCH_WRITE_NOT_ALLOWED|PR_HEAD_MOVED_RELOAD_REQUIRED/
  );
  assert.equal(blobWrites, 0);
});

test("refuses to write directly to the main branch even through a PR head", async () => {
  const head = "d".repeat(40);
  const { client } = makeClient(async (url, options = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/access_tokens")) {
      return jsonResponse(201, {
        token: "installation-token",
        expires_at: new Date(1_800_000_000_000 + 3600_000).toISOString()
      });
    }
    if (parsed.pathname.endsWith("/pulls/19")) {
      return jsonResponse(200, {
        number: 19,
        state: "open",
        head: {
          ref: "main",
          sha: head,
          repo: { full_name: "Sabab-tech/world-map-strategy-" }
        }
      });
    }
    throw new Error("No write should be attempted for main");
  });

  await assert.rejects(
    client.commitPullRequestFiles(19, head, [{ path: "fix.js", content: "x" }], "fix"),
    /MAIN_BRANCH_WRITE_NOT_ALLOWED/
  );
});
test("PR check reader uses only granted Checks and Actions read endpoints", async () => {
  const head = "e".repeat(40);
  const { client } = makeClient(async (url, options = {}) => {
    const parsed = new URL(String(url));
    const route = parsed.pathname;
    if (route.endsWith("/access_tokens")) {
      return jsonResponse(201, {
        token: "installation-token",
        expires_at: new Date(1_800_000_000_000 + 3600_000).toISOString()
      });
    }
    if (route.endsWith("/pulls/21")) {
      return jsonResponse(200, { number: 21, head: { sha: head } });
    }
    if (route.endsWith("/commits/" + head + "/check-runs")) {
      return jsonResponse(200, {
        check_runs: [{
          name: "OMEGA PR Agent",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/example/repo/actions/runs/1"
        }]
      });
    }
    if (route.endsWith("/actions/runs")) {
      return jsonResponse(200, {
        workflow_runs: [{
          name: "Node tests",
          status: "completed",
          conclusion: "success"
        }]
      });
    }
    if (route.endsWith("/status")) {
      throw new Error("Commit statuses permission is intentionally not granted");
    }
    throw new Error("Unexpected checks endpoint: " + route);
  });

  const result = await client.getPullRequestChecks(21);
  assert.equal(result.headSha, head);
  assert.equal(result.checkRuns[0].conclusion, "success");
  assert.equal(result.workflowRuns[0].conclusion, "success");
});
test("refuses to replace symlink and submodule entries with regular files", async () => {
  const head = "f".repeat(40);
  let blobWrites = 0;
  const { client } = makeClient(async (url, options = {}) => {
    const parsed = new URL(String(url));
    const route = parsed.pathname;
    const method = options.method || "GET";
    if (route.endsWith("/access_tokens")) {
      return jsonResponse(201, {
        token: "installation-token",
        expires_at: new Date(1_800_000_000_000 + 3600_000).toISOString()
      });
    }
    if (route.endsWith("/pulls/22")) {
      return jsonResponse(200, {
        number: 22,
        state: "open",
        head: {
          ref: "feature/special-file",
          sha: head,
          repo: { full_name: "Sabab-tech/world-map-strategy-" }
        }
      });
    }
    if (route.endsWith("/git/commits/" + head)) {
      return jsonResponse(200, { tree: { sha: "special-tree" } });
    }
    if (route.endsWith("/git/trees/special-tree")) {
      return jsonResponse(200, {
        truncated: false,
        tree: [{ path: "assets/current-link", type: "blob", mode: "120000" }]
      });
    }
    if (route.endsWith("/git/blobs") && method === "POST") blobWrites += 1;
    throw new Error("Unexpected route; special entries must be blocked: " + route);
  });

  await assert.rejects(
    client.commitPullRequestFiles(
      22,
      head,
      [{ path: "assets/current-link", content: "ordinary file content" }],
      "fix: update asset"
    ),
    /UNSUPPORTED_EXISTING_FILE_MODE/
  );
  assert.equal(blobWrites, 0);
});

