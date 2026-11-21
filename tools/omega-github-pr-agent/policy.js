const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 750 * 1024;
const BLOCKED_PATH = /(^|\/)(\.env(?:\..*)?|secrets?|credentials?)(\/|$)|(^|\/)(id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|jks))$/i;

export function assertSafeRepoPath(input) {
  const value = String(input || "");
  if (!value || value.length > 400) throw new Error("FILE_PATH_INVALID");
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error("FILE_PATH_INVALID");
  }
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) {
    throw new Error("FILE_PATH_INVALID");
  }
  if (parts[0] === ".git" || BLOCKED_PATH.test(value)) {
    throw new Error("SENSITIVE_FILE_PATH_BLOCKED");
  }
  if (value.startsWith(".github/workflows/") || value === ".github/workflows") {
    throw new Error("WORKFLOW_FILE_WRITE_BLOCKED");
  }
  return value;
}

export function validateFileEdits(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) {
    throw new Error("FILE_EDIT_COUNT_INVALID");
  }

  const seen = new Set();
  let totalBytes = 0;
  const normalized = files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("FILE_EDIT_INVALID");
    if (entry.delete === true || entry.operation === "delete" || entry.content === null) {
      throw new Error("FILE_DELETION_NOT_ALLOWED");
    }
    const path = assertSafeRepoPath(entry.path);
    if (seen.has(path)) throw new Error("DUPLICATE_FILE_PATH");
    seen.add(path);
    if (typeof entry.content !== "string") throw new Error("FILE_CONTENT_MUST_BE_TEXT");
    const bytes = Buffer.byteLength(entry.content, "utf8");
    if (bytes > MAX_TOTAL_BYTES) throw new Error("FILE_CONTENT_TOO_LARGE");
    totalBytes += bytes;
    return { path, content: entry.content };
  });

  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("PATCH_TOO_LARGE");
  return normalized;
}

export function validatePullNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("PR_NUMBER_INVALID");
  return number;
}

export function validateComment(value, fieldName = "COMMENT") {
  const comment = String(value || "").trim();
  if (!comment || comment.length > 12000) throw new Error(fieldName + "_INVALID");
  return comment;
}

export function validateCommitMessage(value) {
  const message = String(value || "").trim();
  if (!message || message.length > 180) throw new Error("COMMIT_MESSAGE_INVALID");
  return message;
}

export function validateHeadSha(value) {
  const sha = String(value || "").trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("HEAD_SHA_INVALID");
  return sha;
}
