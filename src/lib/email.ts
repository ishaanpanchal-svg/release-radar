import { Resend } from "resend";
import { db } from "./db";
import { getDigest } from "./digest";
import { fmtDay, fmtDayYear } from "./format";
import { groupByRepo, type RepoGroup } from "./group";
import type { DigestRow, ItemRow } from "./types";

const COLORS = {
  red: { bg: "#fef2f2", border: "#dc2626", text: "#991b1b", label: "HIGH" },
  yellow: { bg: "#fffbeb", border: "#d97706", text: "#92400e", label: "MEDIUM" },
  green: { bg: "#f0fdf4", border: "#16a34a", text: "#166534", label: "LOW" },
} as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

const MAX_EMAIL_RELEASES_PER_REPO = 4;

function releaseHtml(i: ItemRow): string {
  const c = COLORS[i.importance];
  const badges = [i.is_security ? "SECURITY" : "", i.is_breaking ? "BREAKING" : "", i.unsure ? "NOT SURE, PLEASE CHECK" : ""]
    .filter(Boolean)
    .map((b) => `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9px;background:${c.border};color:#fff;font-size:11px;font-weight:700">${b}</span>`)
    .join("");
  const changes = i.key_changes.length
    ? `<ul style="margin:4px 0 0 18px;padding:0;color:#374151;font-size:13px">${i.key_changes.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`
    : "";
  return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.06)">
    <div style="font-size:14px;font-weight:600;color:${c.text}"><a href="${esc(i.release_url ?? "#")}" style="color:${c.text};text-decoration:none">${esc(i.release_tag ?? "")}</a>${badges}</div>
    <div style="font-size:14px;color:#111827;margin-top:2px">${esc(i.summary ?? "")}</div>${changes}
  </div>`;
}

function groupHtml(g: RepoGroup): string {
  const c = COLORS[g.importance];
  const shown = g.items.slice(0, MAX_EMAIL_RELEASES_PER_REPO);
  const more = g.items.length - shown.length;
  return `<div style="border-left:4px solid ${c.border};background:${c.bg};padding:10px 14px;margin:0 0 10px;border-radius:4px">
    <div style="font-size:15px;font-weight:700;color:${c.text}"><a href="https://github.com/${esc(g.repo)}/releases" style="color:${c.text};text-decoration:none">${esc(g.repo)}</a> <span style="font-size:12px;font-weight:400;color:#6b7280">${g.items.length} release${g.items.length === 1 ? "" : "s"}</span></div>
    ${shown.map(releaseHtml).join("")}
    ${more > 0 ? `<div style="margin-top:8px;font-size:12px;color:#6b7280">+ ${more} more on the dashboard</div>` : ""}
  </div>`;
}

export function buildEmail(digest: DigestRow, items: ItemRow[]): { subject: string; html: string; text: string } {
  const groups = groupByRepo(items);
  const red = groups.filter((g) => g.importance === "red");
  const yellow = groups.filter((g) => g.importance === "yellow");
  const green = groups.filter((g) => g.importance === "green");
  const range = `${fmtDay(digest.window_start)} to ${fmtDayYear(digest.window_end)}`;
  const link = appUrl();

  const subject = red.length
    ? `${red.length} repo${red.length === 1 ? "" : "s"} need${red.length === 1 ? "s" : ""} your attention · Release Radar, ${range}`
    : items.length
      ? `Release Radar: ${items.length} release${items.length === 1 ? "" : "s"}, nothing urgent · ${range}`
      : `Release Radar: quiet period · ${range}`;

  const section = (title: string, color: string, list: RepoGroup[]) =>
    list.length ? `<h2 style="font-size:16px;margin:22px 0 8px;color:${color}">${title} (${list.length})</h2>${list.map(groupHtml).join("")}` : "";

  const quiet = digest.quiet_repos.length
    ? `<h2 style="font-size:16px;margin:22px 0 6px;color:#6b7280">Nothing shipped (${digest.quiet_repos.length})</h2><p style="font-size:13px;color:#6b7280;margin:0">${digest.quiet_repos.map((q) => esc(q.full_name)).join(" · ")}</p>`
    : "";
  const errs = digest.errors.length
    ? `<h2 style="font-size:16px;margin:22px 0 6px;color:#b45309">Could not check (${digest.errors.length})</h2><ul style="font-size:13px;color:#92400e;margin:0 0 0 18px;padding:0">${digest.errors.map((e) => `<li>${esc(e.repo)}: ${esc(e.message)}</li>`).join("")}</ul>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:20px">
    <div style="background:#fff;border-radius:10px;padding:22px 24px;border:1px solid #e5e7eb">
      <div style="font-size:13px;color:#6b7280">Release Radar · ${range}</div>
      <h1 style="font-size:20px;margin:4px 0 4px;color:#111827">Hi Keerthi, here is what shipped</h1>
      <div style="font-size:15px;color:#374151;margin-bottom:6px">${esc(digest.headline ?? "")}</div>
      ${section("Needs attention now", COLORS.red.text, red)}
      ${section("Worth a look", COLORS.yellow.text, yellow)}
      ${section("Routine", COLORS.green.text, green)}
      ${quiet}${errs}
      <p style="margin:26px 0 0"><a href="${esc(link)}" style="background:#111827;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-size:14px">Open the dashboard</a></p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:12px">Only releases are included. Issues, pull requests and comments are filtered out.</p>
  </div></body></html>`;

  const plain = (list: RepoGroup[]) =>
    list
      .flatMap((g) => g.items)
      .map((i) => `- ${i.repo_full_name} ${i.release_tag}${i.unsure ? " [NOT SURE]" : ""}: ${i.summary}\n  ${i.release_url}`)
      .join("\n");
  const text = [
    `Release Radar · ${range}`,
    digest.headline ?? "",
    red.length ? `\nNEEDS ATTENTION NOW\n${plain(red)}` : "",
    yellow.length ? `\nWORTH A LOOK\n${plain(yellow)}` : "",
    green.length ? `\nROUTINE\n${plain(green)}` : "",
    digest.quiet_repos.length ? `\nNothing shipped: ${digest.quiet_repos.map((q) => q.full_name).join(", ")}` : "",
    `\nDashboard: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

/** Sends the digest and records the result on the digest row, whether it worked or not. */
export async function sendDigestEmail(digestId: string): Promise<{ ok: boolean; error?: string }> {
  const to = process.env.DIGEST_TO_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const loaded = await getDigest(digestId);
  if (!loaded) return { ok: false, error: "Digest not found" };

  const record = async (patch: Partial<DigestRow>) => {
    await db().from("digests").update(patch).eq("id", digestId);
  };

  if (!to || !apiKey) {
    const error = "Email is not configured (RESEND_API_KEY or DIGEST_TO_EMAIL missing)";
    await record({ email_status: "failed", email_error: error });
    return { ok: false, error };
  }

  try {
    const { subject, html, text } = buildEmail(loaded.digest, loaded.items);
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || "Release Radar <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    });
    if (error) throw new Error(error.message);
    await record({ email_status: "sent", email_sent_at: new Date().toISOString(), email_to: to, email_error: null });
    return { ok: true };
  } catch (err) {
    const message = String((err as Error).message ?? err).slice(0, 300);
    await record({ email_status: "failed", email_to: to, email_error: message });
    return { ok: false, error: message };
  }
}
