import { createHash } from "node:crypto";
import { db } from "./db";
import { AiResultSchema, classifyBatch, type AiResult } from "./gemini";
import { mergeClassification, MIN_USEFUL_NOTES } from "./classify";
import { analyzeRelease } from "./rules";
import { getAdvisoriesInWindow, getReleasesInWindow } from "./github";
import type {
  AdvisoryInfo,
  DigestCounts,
  DigestError,
  DigestRow,
  ItemRow,
  QuietRepo,
  RawRelease,
  RepoRow,
} from "./types";

const AI_BATCH_SIZE = 8; // fewer, larger calls: the free Gemini tier is only 20 requests/day per model
const AI_CONCURRENCY = 2;
const MAX_RELEASES_PER_DIGEST = 60;
const GITHUB_CONCURRENCY = 6;

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

async function loadCachedAi(keys: { repo: string; tag: string; hash: string }[]): Promise<Map<string, { result: AiResult; model: string }>> {
  const out = new Map<string, { result: AiResult; model: string }>();
  if (keys.length === 0) return out;
  const { data } = await db()
    .from("digest_items")
    .select("repo_full_name, release_tag, body_hash, ai_raw, ai_model, id")
    .in("body_hash", [...new Set(keys.map((k) => k.hash))])
    .not("ai_raw", "is", null)
    .order("id", { ascending: false })
    .limit(500);
  for (const row of data ?? []) {
    const key = `${row.repo_full_name}|${row.release_tag}|${row.body_hash}`;
    if (out.has(key)) continue;
    const parsed = AiResultSchema.safeParse(row.ai_raw);
    if (parsed.success) out.set(key, { result: parsed.data, model: (row.ai_model as string) ?? "cached" });
  }
  return out;
}

const RANK = { red: 0, yellow: 1, green: 2 } as const;

export function sortItems<T extends Pick<ItemRow, "importance" | "unsure" | "published_at">>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      RANK[a.importance] - RANK[b.importance] ||
      Number(b.unsure) - Number(a.unsure) ||
      (b.published_at ?? "").localeCompare(a.published_at ?? ""),
  );
}

function makeHeadline(items: Pick<ItemRow, "importance" | "repo_full_name" | "is_security" | "is_breaking">[], repos: number): string {
  const reds = items.filter((i) => i.importance === "red");
  if (reds.length) {
    const names = reds
      .slice(0, 4)
      .map((i) => `${i.repo_full_name.split("/")[1]} (${i.is_security ? "security" : "breaking"})`)
      .join(", ");
    return `${reds.length} need${reds.length === 1 ? "s" : ""} attention now: ${names}${reds.length > 4 ? ", …" : ""}`;
  }
  if (items.length) return `${items.length} new release${items.length === 1 ? "" : "s"} across ${repos} repos, nothing urgent`;
  return `Quiet period: no new releases across ${repos} repos`;
}

export async function runDigest(opts: { kind: "scheduled" | "manual"; days?: number }): Promise<{ digestId: string }> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 90);
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const { data: repos, error: repoErr } = await db().from("repos").select("*").order("full_name");
  if (repoErr) throw new Error(`Could not load tracked repos: ${repoErr.message}`);
  const tracked = (repos ?? []) as RepoRow[];
  if (tracked.length === 0) throw new Error("No repositories are being tracked yet. Add at least one first.");

  const errors: DigestError[] = [];
  const quiet: QuietRepo[] = [];
  const releases: { release: RawRelease; advisories: AdvisoryInfo[] }[] = [];
  let prereleasesSkipped = 0;

  // 1. Live data from GitHub. Pre-releases (alpha, beta, rc, canary) are left out and only counted.
  await pool(tracked, GITHUB_CONCURRENCY, async (repo) => {
    try {
      const [all, advisories] = await Promise.all([
        getReleasesInWindow(repo.full_name, windowStart, windowEnd),
        getAdvisoriesInWindow(repo.full_name, windowStart, windowEnd),
      ]);
      const rels = all.filter((r) => !r.prerelease);
      prereleasesSkipped += all.length - rels.length;
      if (rels.length === 0) quiet.push({ full_name: repo.full_name, html_url: repo.html_url });
      for (const release of rels) releases.push({ release, advisories });
    } catch (err) {
      errors.push({ repo: repo.full_name, message: String((err as Error).message ?? err) });
    }
  });

  releases.sort((a, b) => b.release.publishedAt.localeCompare(a.release.publishedAt));
  if (releases.length > MAX_RELEASES_PER_DIGEST) {
    errors.push({
      repo: "(limit)",
      message: `${releases.length - MAX_RELEASES_PER_DIGEST} older releases were not summarised. Use a shorter look-back.`,
    });
    releases.length = MAX_RELEASES_PER_DIGEST;
  }

  // 2. Rules (always) and Gemini (for releases that have notes worth reading).
  const rows = releases.map((r, i) => ({
    id: `r${i}`,
    release: r.release,
    advisories: r.advisories,
    rules: analyzeRelease(r.release.tag, r.release.body, r.release.prerelease),
  }));

  const aiResults = new Map<string, AiResult>();
  const aiModels = new Map<string, string>();
  const hashes = new Map(rows.map((r) => [r.id, bodyHash(r.release.body)]));

  // Reuse the AI's earlier answer for any release whose notes are unchanged. Saves quota and keeps summaries stable.
  const cached = await loadCachedAi(rows.map((r) => ({ repo: r.release.repo, tag: r.release.tag, hash: hashes.get(r.id)! })));
  for (const r of rows) {
    const hit = cached.get(`${r.release.repo}|${r.release.tag}|${hashes.get(r.id)}`);
    if (hit) {
      aiResults.set(r.id, { ...hit.result, id: r.id });
      aiModels.set(r.id, hit.model);
    }
  }

  const readable = rows.filter((r) => r.release.body.trim().length >= MIN_USEFUL_NOTES && !aiResults.has(r.id));
  const batches: (typeof readable)[] = [];
  for (let i = 0; i < readable.length; i += AI_BATCH_SIZE) batches.push(readable.slice(i, i + AI_BATCH_SIZE));
  await pool(batches, AI_CONCURRENCY, async (batch) => {
    const { results, error, model } = await classifyBatch(batch.map((b) => ({ id: b.id, release: b.release, advisories: b.advisories })));
    results.forEach((v, k) => {
      aiResults.set(k, v);
      if (model) aiModels.set(k, model);
    });
    if (error) errors.push({ repo: "(AI)", message: `Gemini failed for ${batch.length} release(s); rules-only fallback used. ${error}` });
  });

  // 3. Merge into final items.
  const items = rows.map((r) => {
    const c = mergeClassification(r.release, r.rules, aiResults.get(r.id), r.advisories);
    return {
      repo_full_name: r.release.repo,
      release_tag: r.release.tag,
      release_name: r.release.name,
      release_url: r.release.url,
      published_at: r.release.publishedAt,
      is_prerelease: r.release.prerelease,
      ...c,
      body_hash: hashes.get(r.id) ?? null,
      ai_raw: aiResults.get(r.id) ?? null,
      ai_model: aiModels.get(r.id) ?? null,
    };
  });

  const counts: DigestCounts = {
    red: items.filter((i) => i.importance === "red").length,
    yellow: items.filter((i) => i.importance === "yellow").length,
    green: items.filter((i) => i.importance === "green").length,
    unsure: items.filter((i) => i.unsure).length,
    quiet: quiet.length,
    errors: errors.length,
    prereleases: prereleasesSkipped,
  };

  // 4. Save.
  quiet.sort((a, b) => a.full_name.localeCompare(b.full_name));
  const { data: digest, error: insErr } = await db()
    .from("digests")
    .insert({
      kind: opts.kind,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      repos_checked: tracked.length,
      counts,
      quiet_repos: quiet,
      errors,
      headline: makeHeadline(items, tracked.length),
    })
    .select("id")
    .single();
  if (insErr || !digest) throw new Error(`Could not save the digest: ${insErr?.message}`);

  if (items.length) {
    const { error: itemsErr } = await db()
      .from("digest_items")
      .insert(items.map((i) => ({ ...i, digest_id: digest.id })));
    if (itemsErr) throw new Error(`Could not save digest items: ${itemsErr.message}`);
  }

  return { digestId: digest.id as string };
}

export async function getDigest(id: string): Promise<{ digest: DigestRow; items: ItemRow[] } | null> {
  const { data: digest } = await db().from("digests").select("*").eq("id", id).maybeSingle();
  if (!digest) return null;
  const { data: items } = await db().from("digest_items").select("*").eq("digest_id", id);
  return { digest: digest as DigestRow, items: sortItems((items ?? []) as ItemRow[]) };
}

export async function getLatestDigest(): Promise<{ digest: DigestRow; items: ItemRow[] } | null> {
  const { data } = await db().from("digests").select("id").order("created_at", { ascending: false }).limit(1);
  if (!data?.length) return null;
  return getDigest(data[0].id as string);
}
