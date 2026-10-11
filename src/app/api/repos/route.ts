import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRepoMeta, parseRepoInput, GitHubError } from "@/lib/github";

const MAX_REPOS = 60;

/** Accepts one or many links (separated by spaces, commas or new lines) and adds each valid public repo. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const raw = typeof body?.input === "string" ? body.input : "";
  const tokens = raw.split(/[\s,]+/).filter(Boolean).slice(0, 40);
  if (tokens.length === 0) return NextResponse.json({ error: "Paste a GitHub repository link first." }, { status: 400 });

  const { count } = await db().from("repos").select("id", { count: "exact", head: true });
  let total = count ?? 0;

  const added: string[] = [];
  const failed: { input: string; reason: string }[] = [];

  for (const token of tokens) {
    const parsed = parseRepoInput(token);
    if (!parsed) {
      failed.push({ input: token, reason: "That does not look like a GitHub repository link (expected github.com/owner/repo)." });
      continue;
    }
    if (total >= MAX_REPOS) {
      failed.push({ input: token, reason: `The tracked list is limited to ${MAX_REPOS} repositories.` });
      continue;
    }
    try {
      const meta = await getRepoMeta(parsed.owner, parsed.name);
      const { error } = await db().from("repos").insert({
        owner: meta.owner,
        name: meta.name,
        full_name: meta.full_name,
        html_url: meta.html_url,
        description: meta.description,
      });
      if (error) {
        if (error.code === "23505") failed.push({ input: token, reason: `${meta.full_name} is already being tracked.` });
        else failed.push({ input: token, reason: "Could not save it. Please try again." });
        continue;
      }
      total++;
      added.push(meta.full_name + (meta.archived ? " (archived, so it will rarely have new releases)" : ""));
    } catch (err) {
      const reason = err instanceof GitHubError ? err.message : "Could not reach GitHub. Please try again.";
      failed.push({ input: token, reason });
    }
  }

  const status = added.length ? 200 : 400;
  return NextResponse.json({ added, failed }, { status });
}
