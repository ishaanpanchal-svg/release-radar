export type Importance = "red" | "yellow" | "green";

export interface RepoRow {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  added_at: string;
}

export interface ItemRow {
  id: string;
  digest_id: string;
  repo_full_name: string;
  release_tag: string | null;
  release_name: string | null;
  release_url: string | null;
  published_at: string | null;
  is_prerelease: boolean;
  importance: Importance;
  unsure: boolean;
  is_security: boolean;
  is_breaking: boolean;
  summary: string | null;
  key_changes: string[];
  evidence: string[];
  reason: string | null;
  ai_status: string | null;
}

export interface QuietRepo {
  full_name: string;
  html_url: string;
}

export interface DigestError {
  repo: string;
  message: string;
}

export interface DigestCounts {
  red: number;
  yellow: number;
  green: number;
  unsure: number;
  quiet: number;
  errors: number;
  /** Alpha, beta, rc and canary builds that were left out on purpose. */
  prereleases?: number;
}

export interface DigestRow {
  id: string;
  kind: "scheduled" | "manual";
  window_start: string;
  window_end: string;
  created_at: string;
  repos_checked: number;
  counts: DigestCounts;
  quiet_repos: QuietRepo[];
  errors: DigestError[];
  headline: string | null;
  email_status: string | null;
  email_sent_at: string | null;
  email_to: string | null;
  email_error: string | null;
}

/** A release as read from GitHub, before any AI is involved. */
export interface RawRelease {
  repo: string;
  tag: string;
  name: string | null;
  body: string;
  url: string;
  prerelease: boolean;
  publishedAt: string;
  tagOnly: boolean;
}

export interface AdvisoryInfo {
  ghsaId: string;
  cveId: string | null;
  severity: string | null;
  summary: string;
  url: string;
  /** Versions the advisory says contain the fix, as text (for example "4.13.11"). */
  patched: string[];
}
