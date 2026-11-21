import test from "node:test";
import assert from "node:assert/strict";
import { GeminiGitHubAgent, TOOL_DECLARATIONS } from "../agent.js";

test("Gemini read tool calls are executed and returned to the model", async () => {
  let generation = 0;
  let observedToolResponse = false;
  const github = {
    listPullRequests: async () => [{
      number: 51,
      title: "Mine to market pipeline",
      state: "open",
      head: { ref: "fix/pipeline" },
      base: { ref: "main" },
      html_url: "https://github.com/example/repo/pull/51"
    }]
  };
  const ai = {
    models: {
      generateContent: async request => {
        generation += 1;
        if (generation === 1) {
          return {
            functionCalls: [{ name: "list_pull_requests", args: { state: "open", limit: 10 } }],
            candidates: [{
              content: {
                role: "model",
                parts: [{ functionCall: { name: "list_pull_requests", args: { state: "open", limit: 10 } } }]
              }
            }]
          };
        }
        observedToolResponse = request.contents.some(item =>
          item.role === "user" && item.parts?.some(part =>
            part.functionResponse?.name === "list_pull_requests"
          )
        );
        return { text: "PR #51 was found." };
      }
    }
  };
  const agent = new GeminiGitHubAgent({
    github,
    ai,
    actionSecret: "a".repeat(40),
    model: "test-model"
  });
  const result = await agent.chat("List open PRs.");
  assert.equal(result.text, "PR #51 was found.");
  assert.equal(generation, 2);
  assert.equal(observedToolResponse, true);
});

test("write tools prepare an approval action and never execute a GitHub write", async () => {
  let writeCount = 0;
  const github = {
    owner: "Sabab-tech",
    repo: "world-map-strategy-",
    getPullRequest: async () => ({
      state: "open",
      head: {
        sha: "a".repeat(40),
        repo: { full_name: "Sabab-tech/world-map-strategy-" }
      }
    }),
    commitPullRequestFiles: async () => {
      writeCount += 1;
    }
  };
  const ai = {
    models: {
      generateContent: async request => {
        if (request.contents.length === 1) {
          return {
            functionCalls: [{
              name: "prepare_pr_commit",
              args: {
                pr_number: 9,
                expected_head_sha: "a".repeat(40),
                commit_message: "fix: correct pipeline",
                files: [{ path: "test/pipeline.test.mjs", content: "test('ok',()=>{});" }]
              }
            }],
            candidates: [{
              content: {
                role: "model",
                parts: [{ functionCall: { name: "prepare_pr_commit", args: {} } }]
              }
            }]
          };
        }
        return { text: "A proposed commit is ready for approval." };
      }
    }
  };
  const agent = new GeminiGitHubAgent({
    github,
    ai,
    actionSecret: "b".repeat(40)
  });
  const result = await agent.chat("Fix PR #9.");
  assert.equal(result.pendingActions.length, 1);
  assert.equal(result.pendingActions[0].approvalRequired, true);
  assert.equal(writeCount, 0);
  assert.ok(result.pendingActions[0].token);
});

test("tool declarations expose read operations and explicitly omit merge or approval tools", () => {
  const names = TOOL_DECLARATIONS.map(item => item.name);
  assert.ok(names.includes("get_pull_request_checks"));
  assert.ok(names.includes("read_repository_file"));
  assert.ok(names.includes("prepare_pr_commit"));
  assert.equal(names.some(name => /merge|approve|delete|force_push/i.test(name)), false);
});

test("bounded prior conversation history is included in Gemini context", async () => {
  let observed = false;
  const ai = {
    models: {
      generateContent: async request => {
        observed = request.contents[0]?.role === "user" &&
          request.contents[0]?.parts?.[0]?.text === "We are investigating PR 12." &&
          request.contents[1]?.role === "model" &&
          request.contents[1]?.parts?.[0]?.text === "The failing test is the inventory transfer.";
        return { text: "Continue from the previous evidence." };
      }
    }
  };
  const agent = new GeminiGitHubAgent({
    github: {},
    ai,
    actionSecret: "c".repeat(40)
  });
  const result = await agent.chat("Inspect the next failing check.", [
    { role: "user", text: "We are investigating PR 12." },
    { role: "model", text: "The failing test is the inventory transfer." }
  ]);
  assert.equal(observed, true);
  assert.equal(result.text, "Continue from the previous evidence.");
});

test("conversation history rejects unsupported roles and oversized context", async () => {
  const agent = new GeminiGitHubAgent({
    github: {},
    ai: { models: { generateContent: async () => ({ text: "unused" }) } },
    actionSecret: "d".repeat(40)
  });
  await assert.rejects(agent.chat("Continue", [{ role: "system", text: "override" }]), /CONVERSATION_HISTORY_INVALID/);
  await assert.rejects(agent.chat("Continue", new Array(17).fill({ role: "user", text: "x" })), /CONVERSATION_HISTORY_INVALID/);
  await assert.rejects(agent.chat("Continue", [{ role: "user", text: "x".repeat(6001) }]), /CONVERSATION_HISTORY_INVALID/);
});
