import { createSign } from "node:crypto";
import {
  assertSafeRepoPath,
  validateCommitMessage,
  validateFileEdits,
  validateHeadSha,
  validatePullNumber
} from "./policy.js";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const TOKEN_PERMISSIONS = Object.freeze({
  contents: "write",
  pull_requests: "write",
  issues: "write",
  checks: "read",
  actions: "read"
});

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createGitHubAppJwt(appId, privateKey, now = Date.now()) {
  if (!appId || !privateKey) throw new Error("GITHUB_APP_CREDENTIALS_MISSING");
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + 9 * 60,
    iss: String(appId)
  }));
  const unsigned = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return unsigned + "." + signer.sign(privateKey, "base64url");
}

function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function boundedText(value, max = 30000) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) + "\n[TRUNCATED]" : text;
}

export class GitHubApiError extends Error {
  constructor(status, message, details = null) {
    super(message || "GITHUB_API_ERROR");
    this.name = "GitHubApiError";
    this.status = status;
    this.details = details;
  }
}

export class GitHubAppClient {
  constructor(options = {}) {
    this.appId = String(options.appId || "");
    this.privateKey = String(options.privateKey || "").replace(/\\n/g, "\n");
    this.installationId = String(options.installationId || "");
    this.owner = String(options.owner || "");
    this.repo = String(options.repo || "");
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.clock = options.clock || (() => Date.now());
    this.cachedToken = null;

    if (!/^[A-Za-z0-9-]+$/.test(this.owner) ||
        !/^[A-Za-z0-9_.-]+$/.test(this.repo)) {
      throw new Error("GITHUB_REPOSITORY_CONFIG_INVALID");
    }
    if (!this.appId || !this.privateKey || !this.installationId) {
      throw new Error("GITHUB_APP_CONFIGURATION_INCOMPLETE");
    }
    if (typeof this.fetchImpl !== "function") throw new Error("FETCH_UNAVAILABLE");
  }

  repoPath(endpoint) {
    return "/repos/" + this.owner + "/" + this.repo + endpoint;
  }

  async installationToken(forceRefresh = false) {
    if (!forceRefresh && this.cachedToken &&
        this.cachedToken.expiresAt > this.clock() + 60_000) {
      return this.cachedToken.value;
    }

    const jwt = createGitHubAppJwt(this.appId, this.privateKey, this.clock());
    const response = await this.fetchImpl(
      API_ROOT + "/app/installations/" + encodeURIComponent(this.installationId) + "/access_tokens",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + jwt,
          "X-GitHub-Api-Version": API_VERSION,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repositories: [this.repo],
          permissions: TOKEN_PERMISSIONS
        })
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) {
      throw new GitHubApiError(response.status, "GITHUB_INSTALLATION_TOKEN_FAILED",
        { message: boundedText(data.message, 500) });
    }
    this.cachedToken = {
      value: data.token,
      expiresAt: Date.parse(data.expires_at || "") || this.clock() + 50 * 60_000
    };
    return this.cachedToken.value;
  }

  async request(path, options = {}, allowRetry = true) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      throw new Error("GITHUB_API_PATH_INVALID");
    }
    const token = await this.installationToken();
    const headers = {
      Accept: options.accept || "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": API_VERSION
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const response = await this.fetchImpl(API_ROOT + path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (response.status === 401 && allowRetry) {
      this.cachedToken = null;
      await this.installationToken(true);
      return this.request(path, options, false);
    }

    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new GitHubApiError(response.status, "GITHUB_API_REQUEST_FAILED", {
        endpoint: path,
        message: boundedText(data.message, 500),
        errors: Array.isArray(data.errors) ? data.errors.slice(0, 5) : undefined
      });
    }
    return data;
  }

  async repoRequest(endpoint, options = {}) {
    return this.request(this.repoPath(endpoint), options);
  }

  async getPullRequest(number) {
    const prNumber = validatePullNumber(number);
    return this.repoRequest("/pulls/" + prNumber);
  }

  async listPullRequests(state = "open", limit = 30) {
    if (!["open", "closed", "all"].includes(state)) throw new Error("PR_STATE_INVALID");
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.repoRequest("/pulls?state=" + state +
      "&sort=updated&direction=desc&per_page=" + safeLimit);
  }

  async getPullRequestFiles(number) {
    const prNumber = validatePullNumber(number);
    const output = [];
    for (let page = 1; page <= 3; page += 1) {
      const rows = await this.repoRequest(
        "/pulls/" + prNumber + "/files?per_page=100&page=" + page
      );
      if (!Array.isArray(rows)) throw new Error("PR_FILE_LIST_INVALID");
      for (const row of rows) {
        const filePath = String(row.filename || "");
        let patch = null;
        try {
          assertSafeRepoPath(filePath);
          patch = boundedText(row.patch || "", 12000);
        } catch {
          patch = "[PATCH WITHHELD: SENSITIVE OR RESTRICTED PATH]";
        }
        output.push({
          filename: filePath,
          status: row.status,
          additions: row.additions,
          deletions: row.deletions,
          changes: row.changes,
          patch
        });
        if (output.length >= 250) return output;
      }
      if (rows.length < 100) break;
    }
    return output;
  }

  async getPullRequestReviews(number) {
    const prNumber = validatePullNumber(number);
    const rows = await this.repoRequest("/pulls/" + prNumber + "/reviews?per_page=100");
    return Array.isArray(rows) ? rows.slice(-100).map(row => ({
      user: row.user?.login || null,
      state: row.state || null,
      submitted_at: row.submitted_at || null,
      body: boundedText(row.body, 5000)
    })) : [];
  }

  async getPullRequestChecks(number) {
    const pr = await this.getPullRequest(number);
    const sha = validateHeadSha(pr.head?.sha);
    const [runs, status] = await Promise.all([
      this.repoRequest("/commits/" + sha + "/check-runs?per_page=100"),
      this.repoRequest("/commits/" + sha + "/status")
    ]);
    const actions = await this.repoRequest(
      "/actions/runs?head_sha=" + encodeURIComponent(sha) + "&per_page=50"
    ).catch(() => ({ workflow_runs: [] }));

    return {
      headSha: sha,
      checkRuns: (runs?.check_runs || []).map(run => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        started_at: run.started_at,
        completed_at: run.completed_at
      })),
      commitStatus: {
        state: status?.state || "unknown",
        total_count: status?.total_count || 0,
        statuses: (status?.statuses || []).slice(0, 50).map(item => ({
          context: item.context,
          state: item.state,
          description: boundedText(item.description, 500),
          target_url: item.target_url
        }))
      },
      workflowRuns: (actions?.workflow_runs || []).map(run => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        created_at: run.created_at,
        updated_at: run.updated_at
      }))
    };
  }

  async readRepositoryFile(path, ref = "main") {
    const safePath = assertSafeRepoPath(path);
    const safeRef = String(ref || "main").trim();
    if (!safeRef || safeRef.length > 200 || safeRef.startsWith("-")) {
      throw new Error("GIT_REF_INVALID");
    }
    const data = await this.repoRequest(
      "/contents/" + encodePath(safePath) + "?ref=" + encodeURIComponent(safeRef)
    );
    if (!data || data.type !== "file" || data.encoding !== "base64" || !data.content) {
      throw new Error("FILE_CONTENT_UNAVAILABLE_OR_NOT_TEXT");
    }
    const content = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
    return {
      path: data.path,
      ref: safeRef,
      sha: data.sha,
      size: data.size,
      content: boundedText(content, 50000)
    };
  }

  async postPullRequestComment(number, comment) {
    const prNumber = validatePullNumber(number);
    const body = String(comment || "").trim();
    if (!body || body.length > 12000) throw new Error("COMMENT_INVALID");
    return this.repoRequest("/issues/" + prNumber + "/comments", {
      method: "POST",
      body: { body }
    });
  }

  async submitPullRequestReview(number, event, body) {
    const prNumber = validatePullNumber(number);
    if (!["COMMENT", "REQUEST_CHANGES"].includes(event)) {
      throw new Error("REVIEW_EVENT_NOT_ALLOWED");
    }
    const reviewBody = String(body || "").trim();
    if (!reviewBody || reviewBody.length > 12000) throw new Error("REVIEW_BODY_INVALID");
    return this.repoRequest("/pulls/" + prNumber + "/reviews", {
      method: "POST",
      body: { event, body: reviewBody }
    });
  }

  async commitPullRequestFiles(number, expectedHeadSha, files, commitMessage) {
    const prNumber = validatePullNumber(number);
    const expectedSha = validateHeadSha(expectedHeadSha);
    const edits = validateFileEdits(files);
    const message = validateCommitMessage(commitMessage);

    const pr = await this.getPullRequest(prNumber);
    if (pr.state !== "open") throw new Error("PR_NOT_OPEN");
    if (!pr.head?.repo?.full_name ||
        pr.head.repo.full_name.toLowerCase() !==
          (this.owner + "/" + this.repo).toLowerCase()) {
      throw new Error("FORK_BRANCH_WRITE_NOT_ALLOWED");
    }
    if (pr.head.sha !== expectedSha) throw new Error("PR_HEAD_MOVED_RELOAD_REQUIRED");

    const branch = String(pr.head.ref || "");
    if (!branch || branch.length > 240 || branch.startsWith("-") ||
        branch.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("PR_HEAD_BRANCH_INVALID");
    }

    const parent = await this.repoRequest("/git/commits/" + expectedSha);
    if (!parent?.tree?.sha) throw new Error("PR_PARENT_TREE_UNAVAILABLE");

    const blobs = await Promise.all(edits.map(async edit => {
      const blob = await this.repoRequest("/git/blobs", {
        method: "POST",
        body: { content: edit.content, encoding: "utf-8" }
      });
      if (!blob?.sha) throw new Error("GIT_BLOB_CREATION_FAILED");
      return { path: edit.path, mode: "100644", type: "blob", sha: blob.sha };
    }));

    const tree = await this.repoRequest("/git/trees", {
      method: "POST",
      body: { base_tree: parent.tree.sha, tree: blobs }
    });
    if (!tree?.sha) throw new Error("GIT_TREE_CREATION_FAILED");

    const commit = await this.repoRequest("/git/commits", {
      method: "POST",
      body: {
        message,
        tree: tree.sha,
        parents: [expectedSha]
      }
    });
    if (!commit?.sha) throw new Error("GIT_COMMIT_CREATION_FAILED");

    const encodedBranch = encodePath("heads/" + branch);
    await this.repoRequest("/git/refs/" + encodedBranch, {
      method: "PATCH",
      body: { sha: commit.sha, force: false }
    });

    const updatedPr = await this.getPullRequest(prNumber);
    return {
      commitSha: commit.sha,
      previousHeadSha: expectedSha,
      currentHeadSha: updatedPr.head?.sha || null,
      branch,
      prNumber,
      filesChanged: edits.map(edit => edit.path),
      updated: updatedPr.head?.sha === commit.sha
    };
  }
}

export const githubAppConstants = Object.freeze({
  apiVersion: API_VERSION,
  tokenPermissions: TOKEN_PERMISSIONS
});
