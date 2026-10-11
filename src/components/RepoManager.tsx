"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RepoRow } from "@/lib/types";

export function RepoManager({ repos }: { repos: RepoRow[] }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; lines: string[] } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json().catch(() => ({}));
      const lines: string[] = [];
      for (const a of data.added ?? []) lines.push(`Added ${a}`);
      for (const f of data.failed ?? []) lines.push(`${f.input}: ${f.reason}`);
      if (data.error) lines.push(data.error);
      if (!lines.length) lines.push("Something went wrong. Please try again.");
      setNotice({ tone: (data.added?.length ?? 0) > 0 ? "ok" : "err", lines });
      if ((data.added?.length ?? 0) > 0) {
        setInput("");
        router.refresh();
      }
    } catch {
      setNotice({ tone: "err", lines: ["Could not reach the server. Please try again."] });
    } finally {
      setBusy(false);
    }
  }

  async function remove(repo: RepoRow) {
    setDeleting(repo.id);
    try {
      const res = await fetch(`/api/repos/${repo.id}`, { method: "DELETE" });
      if (res.ok) {
        setNotice({ tone: "ok", lines: [`Removed ${repo.full_name}`] });
        router.refresh();
      } else {
        setNotice({ tone: "err", lines: [`Could not remove ${repo.full_name}. Please try again.`] });
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="space-y-2">
        <label htmlFor="repo-input" className="text-sm font-medium text-gray-700">
          Add a repository
        </label>
        <div className="flex gap-2">
          <input
            id="repo-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a link, e.g. https://github.com/stripe/stripe-node"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:bg-gray-400"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="text-xs text-gray-500">You can paste several links at once, separated by spaces or new lines.</p>
      </form>

      {notice && (
        <ul className={`space-y-0.5 text-sm ${notice.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>
          {notice.lines.map((l, idx) => (
            <li key={idx}>{l}</li>
          ))}
        </ul>
      )}

      <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        {repos.length === 0 && <li className="p-3 text-sm text-gray-500">No repositories yet. Paste a GitHub link above to start tracking.</li>}
        {repos.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <a href={r.html_url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-medium hover:underline" title={r.description ?? r.full_name}>
              {r.full_name}
            </a>
            <button
              onClick={() => remove(r)}
              disabled={deleting === r.id}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:text-gray-400"
              aria-label={`Remove ${r.full_name}`}
            >
              {deleting === r.id ? "Removing…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
