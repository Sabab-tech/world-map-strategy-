# OMEGA GitHub PR Agent

A separate, Gemini-powered PR engineering service for the OMEGA repository. It uses a GitHub App installation token scoped to one repository and the Gemini API key created in Google AI Studio.

This service does not modify or replace the OMEGA game runtime. It does not connect itself to an already-open Google AI Studio Build Mode session. It provides a controlled PR agent UI and backend that can be deployed independently. Google AI Studio's own GitHub two-way sync remains a separate feature.

## Capabilities

- List and inspect open, closed and draft pull requests.
- Read PR metadata, changed-file patches, review history, commit checks and Actions runs.
- Read non-sensitive text files from a selected branch or commit.
- Prepare a code commit on an existing PR branch using GitHub's Git database API (blob, tree, commit and branch reference).
- Prepare PR comments and review submissions.
- Require a signed, short-lived action token and a separate user confirmation before every write.

## Hard boundaries

- The GitHub App installation token is restricted to Sabab-tech/world-map-strategy- and reduced to the permissions listed below.
- No main branch push, PR merge, force-push, history rewrite or file deletion endpoint exists.
- Code commits require the exact current PR head SHA and an open PR.
- Fork-owned PR branches are read-only. The agent will not attempt to push to a fork.
- .env, credential, secret, private-key and certificate paths are blocked from reads and writes.
- .github/workflows/** is blocked from writes. No Actions write or Workflows write permission is requested.
- A PR body, comment, patch or source file is untrusted input. It cannot override the agent's system instructions.
- Gemini does not receive GitHub App private keys, installation tokens or the service access token.

## 1. Create a Gemini API key

Open [Google AI Studio API keys](https://aistudio.google.com/app/apikey) and create a key for the server-side service. Keep it in Cloud Run Secret Manager; never paste it into repository files or frontend code.

## 2. Create a GitHub App

Open [GitHub Developer Settings](https://github.com/settings/apps) and create a new private GitHub App.

Recommended configuration:

- App name: **OMEGA GitHub PR Agent**
- Homepage URL: the Cloud Run service URL after deployment (a temporary repository URL can be used during creation).
- Webhook: inactive. This first version polls GitHub on demand and does not need a webhook secret.
- Repository access: **Only select repositories**; select **Sabab-tech/world-map-strategy-**.

Set these repository permissions:

| Permission | Level | Purpose |
| --- | --- | --- |
| Contents | Read and write | Read files and create Git commits on PR branches |
| Pull requests | Read and write | Read PRs and submit reviews |
| Issues | Read and write | Post PR conversation comments |
| Checks | Read-only | Read commit check-runs |
| Actions | Read-only | Read workflow run results |
| Metadata | Read-only | Automatically required by GitHub |

Do not grant Administration, Actions write, Workflows write, deployments, packages, secrets or organization permissions.

Create the App, install it on the selected repository only, and generate a private key. Record:
- App ID from the App settings page.
- Installation ID from the installation page URL (the number after /settings/installations/).
- The generated PEM private key (store the full PEM content as a secret).

If permissions are changed later, GitHub may require the installation owner to approve the updated permission request.

## 3. Configure environment secrets

Copy .env.example into your deployment environment. Required variables:

| Variable | Value |
| --- | --- |
| GEMINI_API_KEY | Server-side API key from Google AI Studio |
| GEMINI_MODEL | Optional; defaults to gemini-3.8-flash |
| GITHUB_APP_ID | GitHub App ID |
| GITHUB_APP_PRIVATE_KEY | Full PEM private key; multiline is supported |
| GITHUB_INSTALLATION_ID | Installation ID |
| GITHUB_OWNER | Sabab-tech |
| GITHUB_REPO | world-map-strategy- |
| OMEGA_AGENT_ACCESS_TOKEN | Random access secret, at least 32 bytes |
| OMEGA_ACTION_SIGNING_SECRET | A different random signing secret, at least 32 bytes |
| AGENT_ALLOWED_ORIGINS | Optional exact, comma-separated browser origins |

Generate the two independent application secrets:

    openssl rand -hex 32
    openssl rand -hex 32

Never commit real credentials. Never place the GitHub App private key or service access token in browser JavaScript, a public GitHub Actions variable, or a prompt.

## 4. Run locally

Requires Node.js 20.18 or newer.

    cd tools/omega-github-pr-agent
    npm install
    cp .env.example .env
    # Fill .env with the secrets above.
    node --env-file=.env server.js

Open http://localhost:8080, enter OMEGA_AGENT_ACCESS_TOKEN in the password field, and select Connect.

Run the isolated test suite:

    npm test

## 5. Deploy to Cloud Run

Create Secret Manager secrets for each credential, then deploy the subdirectory as its own service. Example:

    gcloud run deploy omega-github-pr-agent \
      --source tools/omega-github-pr-agent \
      --region asia-south1 \
      --allow-unauthenticated \
      --max 1 \
      --set-env-vars GITHUB_OWNER=Sabab-tech,GITHUB_REPO=world-map-strategy-,GEMINI_MODEL=gemini-3.8-flash \
      --set-secrets GITHUB_APP_ID=omega-github-app-id:latest,GITHUB_APP_PRIVATE_KEY=omega-github-app-private-key:latest,GITHUB_INSTALLATION_ID=omega-github-installation-id:latest,GEMINI_API_KEY=omega-gemini-api-key:latest,OMEGA_AGENT_ACCESS_TOKEN=omega-agent-access-token:latest,OMEGA_ACTION_SIGNING_SECRET=omega-action-signing-secret:latest

The service URL is the PR agent UI. The UI is publicly reachable only so the browser can load; every /api/** route requires the independent bearer token. Keep that token private and rotate it if exposed. For stronger perimeter control, use Cloud Run authentication or an identity-aware proxy in front of the service.

If the browser frontend is hosted on a different origin, set AGENT_ALLOWED_ORIGINS to the exact origin, including scheme and port. Do not use a wildcard origin.

## 6. Use with Google AI Studio

- Use the Gemini API key created in Google AI Studio as GEMINI_API_KEY.
- The agent performs its Gemini calls server-side and calls GitHub through the installed GitHub App.
- AI Studio Build Mode's repository import and two-way sync are separate. To use Build Mode itself for editing the OMEGA project, connect the same GitHub repository from the Build Mode GitHub settings; do not paste App credentials into Build Mode chat.
- This service is the PR/code/review interface when Build Mode's native repository sync is not enough. It is not a browser extension and cannot take over an existing Build Mode session.

## Write flow

1. Gemini reads the PR and current evidence.
2. Gemini prepares a proposed commit, review or comment.
3. The UI shows the proposed action and its contents.
4. You select Review & apply and confirm.
5. The server validates the signed action, rechecks that the PR is open and that its exact head SHA has not moved, then performs the GitHub operation.
6. A code commit is pushed with force=false to the PR head branch only. If the branch moved or GitHub refuses the update, the operation fails instead of overwriting newer work.

The agent reports checks exactly as GitHub reports them. It does not run Android tests or claim that an unexecuted test passed.
