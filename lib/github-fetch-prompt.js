/**
 * 公開 GitHub リポジトリから LLM 用 system プロンプト候補を取得（Contents API）
 * 優先順: .buildy/system-prompt.md → … → README.md
 */
import { Buffer } from "buffer";

const PROMPT_PATHS = [
  ".buildy/system-prompt.md",
  ".buildy/prompt.md",
  "buildy/system-prompt.md",
  "buildy/prompt.md",
  "BUILDY_PROMPT.md",
  "docs/BUILDY_PROMPT.md",
  "README.md",
];

const MAX_CHARS = 48000;

export function normalizeGithubOwnerRepo(input) {
  let s = String(input || "")
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (s.startsWith("https://github.com/")) {
    s = s
      .replace(/^https:\/\/github\.com\/?/i, "")
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join("/");
  }
  if (!s.includes("/")) return null;
  return s;
}

/**
 * @param {string} ownerRepo - owner/repo
 * @param {string | null} githubToken - GITHUB_TOKEN（任意・レート制限緩和）
 */
export async function fetchFirstGithubPrompt(ownerRepo, githubToken = null) {
  const normalized = normalizeGithubOwnerRepo(ownerRepo);
  if (!normalized) {
    return { ok: false, error: "invalid_repo", message: "owner/repo 形式の github_repo が必要です" };
  }

  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Buildy-Agent-Sync",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  for (const path of PROMPT_PATHS) {
    const enc = path
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const url = `https://api.github.com/repos/${normalized}/contents/${enc}`;
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      return { ok: false, error: "network", message: e instanceof Error ? e.message : "fetch failed" };
    }
    if (res.status === 404) continue;
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 403) {
        return {
          ok: false,
          error: "github_forbidden",
          message: t || "GitHub API が拒否しました（非公開リポジトリは GITHUB_TOKEN が必要な場合があります）",
        };
      }
      continue;
    }
    let meta;
    try {
      meta = await res.json();
    } catch {
      continue;
    }
    if (Array.isArray(meta) || meta.type !== "file" || typeof meta.content !== "string") continue;

    let text;
    try {
      text = Buffer.from(meta.content, "base64").toString("utf8");
    } catch {
      continue;
    }
    text = text.trim();
    if (!text) continue;
    if (text.length > MAX_CHARS) {
      text = `${text.slice(0, MAX_CHARS)}\n\n…(truncated at ${MAX_CHARS} chars)`;
    }

    return {
      ok: true,
      text,
      sourcePath: path,
      ownerRepo: normalized,
    };
  }

  return {
    ok: false,
    error: "no_prompt_file",
    message:
      "プロンプト用ファイルが見つかりません。.buildy/system-prompt.md / .buildy/prompt.md / BUILDY_PROMPT.md / README.md のいずれかをリポジトリに置いてください。",
  };
}
