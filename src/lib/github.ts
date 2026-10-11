import type { AdvisoryInfo, RawRelease } from "./types";

const API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "release-radar",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new GitHubError("GitHub rate limit reached, try again later", res.status);
    }
    if (res.status === 404) throw new GitHubError("Repository not found (or it is private)", 404);
    throw new GitHubError(`GitHub returned ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/** Accepts a full URL, "github.com/owner/repo", or "owner/repo". Returns null when it cannot be understood. */
export function parseRepoInput(input: string): { owner: string; name: string } | null {
  let s = input.trim();
  if (!s || s.length > 300) return null;
  s = s.replace(/^git@github\.com:/i, "https://github.com/");
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (/^github\.com\//i.test(s)) s = s.slice("github.com/".length);
  else if (/^[^/]+\.[^/]+\//.test(s)) return null; // some other website
  const parts = s.split(/[/?#]/).filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  const ok = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) && /^[A-Za-z0-9._-]{1,100}$/.test(name);
  if (!ok || name === "." || name === "..") return null;
  return { owner, name };
}

export interface RepoMeta {
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  archived: boolean;
}

/** Confirms the repo exists and returns its canonical name (fixes casing and follows renames). */
export async function getRepoMeta(owner: string, name: string): Promise<RepoMeta> {
  const r = await gh<{
    owner: { login: string };
    name: string;
    full_name: string;
    html_url: string;
    description: string | null;
    archived: boolean;
  }>(`/repos/${owner}/${name}`);
  return {
    owner: r.owner.login,
    name: r.name,
    full_name: r.full_name,
    html_url: r.html_url,
    description: r.description,
    archived: r.archived,
  };
}

interface GhRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at: string;
}

const MAX_BODY_CHARS = 60000;

/** GitHub's own "pre-release" flag is often forgotten, so the tag name is checked too (alpha, beta, rc, canary, ...). */
export function isPrereleaseTag(tag: string): boolean {
  return /[-.](alpha|beta|rc|canary|next|dev|preview|nightly|snapshot|insiders|experimental)\b/i.test(tag) || /\d(a|b|rc)\d+$/i.test(tag);
}

export async function getReleasesInWindow(fullName: string, since: Date, until: Date): Promise<RawRelease[]> {
  const found: RawRelease[] = [];
  let sawAnyRelease = false;

  for (let page = 1; page <= 3; page++) {
    const list = await gh<GhRelease[]>(`/repos/${fullName}/releases?per_page=30&page=${page}`);
    if (list.length === 0) break;
    sawAnyRelease = true;
    let oldestOnPage = Infinity;
    for (const r of list) {
      if (r.draft) continue;
      const when = new Date(r.published_at ?? r.created_at);
      oldestOnPage = Math.min(oldestOnPage, when.getTime());
      if (when >= since && when <= until) {
        found.push({
          repo: fullName,
          tag: r.tag_name,
          name: r.name,
          body: (r.body ?? "").slice(0, MAX_BODY_CHARS),
          url: r.html_url,
          prerelease: r.prerelease || isPrereleaseTag(r.tag_name),
          publishedAt: when.toISOString(),
          tagOnly: false,
        });
      }
    }
    if (list.length < 30 || oldestOnPage < since.getTime()) break;
  }

  // Some projects tag versions but never create GitHub Releases. Fall back to tags so they are not silently missed.
  if (!sawAnyRelease) {
    const tags = await gh<{ name: string; commit: { sha: string } }[]>(`/repos/${fullName}/tags?per_page=5`);
    for (const t of tags) {
      try {
        const c = await gh<{ commit: { committer: { date: string } } }>(`/repos/${fullName}/commits/${t.commit.sha}`);
        const when = new Date(c.commit.committer.date);
        if (when >= since && when <= until) {
          found.push({
            repo: fullName,
            tag: t.name,
            name: null,
            body: "",
            url: `https://github.com/${fullName}/releases/tag/${encodeURIComponent(t.name)}`,
            prerelease: isPrereleaseTag(t.name),
            publishedAt: when.toISOString(),
            tagOnly: true,
          });
        }
      } catch {
        // a single unreadable tag should not fail the whole repo
      }
    }
  }

  return found.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Published security advisories for the repo within the window. Optional signal, never throws. */
export async function getAdvisoriesInWindow(fullName: string, since: Date, until: Date): Promise<AdvisoryInfo[]> {
  try {
    const list = await gh<
      {
        ghsa_id: string;
        cve_id: string | null;
        severity: string | null;
        summary: string;
        html_url: string;
        published_at: string | null;
      }[]
    >(`/repos/${fullName}/security-advisories?state=published&per_page=20`);
    return list
      .filter((a) => a.published_at && new Date(a.published_at) >= since && new Date(a.published_at) <= until)
      .map((a) => ({
        ghsaId: a.ghsa_id,
        cveId: a.cve_id,
        severity: a.severity,
        summary: a.summary,
        url: a.html_url,
      }));
  } catch {
    return [];
  }
}
