"use client";

import { useState } from "react";
import { fmtDay, fmtDayYear } from "@/lib/format";
import { groupByRepo, type RepoGroup } from "@/lib/group";
import type { DigestRow, Importance, ItemRow } from "@/lib/types";

export const STYLE: Record<Importance, { dot: string; card: string; text: string; label: string; heading: string }> = {
  red: { dot: "bg-red-500", card: "border-red-200 bg-red-50", text: "text-red-800", label: "High", heading: "Needs attention now" },
  yellow: { dot: "bg-amber-400", card: "border-amber-200 bg-amber-50", text: "text-amber-800", label: "Medium", heading: "Worth a look" },
  green: { dot: "bg-emerald-500", card: "border-emerald-200 bg-emerald-50", text: "text-emerald-800", label: "Low", heading: "Routine" },
};

function Badge({ children, tone }: { children: React.ReactNode; tone: "red" | "orange" | "gray" | "amber" }) {
  const cls = {
    red: "bg-red-600 text-white",
    orange: "bg-orange-600 text-white",
    gray: "bg-gray-200 text-gray-700",
    amber: "border border-amber-500 bg-white text-amber-800",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function ReleaseRow({ item }: { item: ItemRow }) {
  const s = STYLE[item.importance];
  return (
    <li className="border-t border-black/5 py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} title={`${s.label} importance`} />
        <a
          href={item.release_url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
        >
          {item.release_tag}
        </a>
        <span className="text-xs text-gray-500">{item.published_at ? fmtDay(item.published_at) : ""}</span>
        {item.is_security && <Badge tone="red">SECURITY</Badge>}
        {item.is_breaking && <Badge tone="orange">BREAKING</Badge>}
        {item.unsure && <Badge tone="amber">⚠ Not sure, please check</Badge>}
        <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
      </div>
      <p className="mt-1.5 text-sm text-gray-800">{item.summary}</p>
      {item.key_changes.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
          {item.key_changes.map((k, idx) => (
            <li key={idx}>{k}</li>
          ))}
        </ul>
      )}
      {(item.reason || item.evidence.length > 0) && (
        <details className="mt-1.5">
          <summary className="text-xs font-medium text-gray-500 hover:text-gray-800">Why this colour?</summary>
          <div className="mt-1 rounded-md bg-white/70 p-2 text-xs text-gray-700">
            {item.reason && <p>{item.reason}</p>}
            {item.evidence.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {item.evidence.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

function GroupCard({ group }: { group: RepoGroup }) {
  const s = STYLE[group.importance];
  const visible = group.items.slice(0, 3);
  const rest = group.items.slice(3);
  return (
    <div className={`rounded-xl border p-4 ${s.card}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <a
          href={`https://github.com/${group.repo}/releases`}
          target="_blank"
          rel="noreferrer"
          className="text-base font-semibold underline-offset-2 hover:underline"
        >
          {group.repo}
        </a>
        <span className="text-xs text-gray-500">
          {group.items.length} release{group.items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul>
        {visible.map((i) => (
          <ReleaseRow key={i.id} item={i} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="text-sm font-medium text-gray-600 hover:text-gray-900">Show {rest.length} more release{rest.length === 1 ? "" : "s"}</summary>
          <ul className="mt-2">
            {rest.map((i) => (
              <ReleaseRow key={i.id} item={i} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SummaryChips({ digest }: { digest: DigestRow }) {
  const c = digest.counts;
  const chip = (dot: string, n: number, label: string) => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm shadow-sm ring-1 ring-black/5">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <strong>{n}</strong> {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {chip("bg-red-500", c.red, "high")}
      {chip("bg-amber-400", c.yellow, "medium")}
      {chip("bg-emerald-500", c.green, "low")}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500 bg-white px-3 py-1 text-sm text-amber-800">
        ⚠ <strong>{c.unsure}</strong> not sure
      </span>
      {chip("bg-gray-300", c.quiet, "quiet repos")}
    </div>
  );
}

export function DigestView({ digest, items, compact = false }: { digest: DigestRow; items: ItemRow[]; compact?: boolean }) {
  const [onlyUnsure, setOnlyUnsure] = useState(false);
  const shown = onlyUnsure ? items.filter((i) => i.unsure) : items;
  const groups = groupByRepo(shown);
  const byLevel = (lvl: Importance) => groups.filter((g) => g.importance === lvl);

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Releases from <strong>{fmtDay(digest.window_start)}</strong> to <strong>{fmtDayYear(digest.window_end)}</strong> across{" "}
            {digest.repos_checked} repositories. Issues, pull requests and comments are left out on purpose.
          </p>
          <SummaryChips digest={digest} />
        </div>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={onlyUnsure} onChange={(e) => setOnlyUnsure(e.target.checked)} className="h-4 w-4 accent-amber-500" />
        Show only the items the AI was not sure about ({items.filter((i) => i.unsure).length})
      </label>

      {(["red", "yellow", "green"] as Importance[]).map((lvl) => {
        const list = byLevel(lvl);
        if (list.length === 0) {
          if (lvl === "red" && !onlyUnsure)
            return (
              <div key={lvl} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                ✓ Nothing urgent: no security fix or breaking change in this period.
              </div>
            );
          return null;
        }
        const s = STYLE[lvl];
        return (
          <section key={lvl} className="space-y-3">
            <h3 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${s.text}`}>
              <span className={`h-3 w-3 rounded-full ${s.dot}`} />
              {s.heading} ({list.length})
            </h3>
            {list.map((g) => (
              <GroupCard key={g.repo} group={g} />
            ))}
          </section>
        );
      })}

      {onlyUnsure && groups.length === 0 && <p className="text-sm text-gray-600">Nothing was flagged as unsure in this digest.</p>}

      {digest.quiet_repos.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="text-sm font-semibold text-gray-700">
            ⚪ Checked, nothing shipped ({digest.quiet_repos.length})
          </summary>
          <p className="mt-2 text-sm text-gray-600">{digest.quiet_repos.map((q) => q.full_name).join(" · ")}</p>
        </details>
      )}

      {(digest.counts.prereleases ?? 0) > 0 && (
        <p className="text-xs text-gray-500">
          {digest.counts.prereleases} pre-release build{digest.counts.prereleases === 1 ? "" : "s"} (alpha, beta, rc, canary) were hidden. Only stable releases are shown.
        </p>
      )}

      {digest.errors.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Could not check everything ({digest.errors.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {digest.errors.map((e, idx) => (
              <li key={idx}>
                <strong>{e.repo}</strong>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
