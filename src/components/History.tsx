"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/format";
import type { DigestRow, ItemRow } from "@/lib/types";
import { DigestView, SummaryChips } from "./DigestView";

function EmailLine({ d }: { d: DigestRow }) {
  if (d.email_status === "sent" && d.email_sent_at) return <span className="text-emerald-700">✉ Email sent {fmtDateTime(d.email_sent_at)}</span>;
  if (d.email_status === "failed") return <span className="text-red-700">✉ Email failed{d.email_error ? `: ${d.email_error}` : ""}</span>;
  return <span className="text-gray-500">✉ Not emailed</span>;
}

function Entry({ d }: { d: DigestRow }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ digest: DigestRow; items: ItemRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/digests/${d.id}`);
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        setError("Could not load this digest. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold">
            {fmtDateTime(d.created_at)}{" "}
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {d.kind === "scheduled" ? "Monday auto-run" : "Run now"}
            </span>
          </p>
          <p className="text-sm text-gray-700">{d.headline}</p>
          <SummaryChips digest={d} />
          <p className="text-xs">
            <EmailLine d={d} />
          </p>
        </div>
        <button
          onClick={toggle}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          {open ? "Hide" : "Show me"}
        </button>
      </div>
      {open && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {data && <DigestView digest={data.digest} items={data.items} compact />}
        </div>
      )}
    </li>
  );
}

export function History({ digests }: { digests: DigestRow[] }) {
  if (digests.length === 0) return <p className="text-sm text-gray-500">No digests yet. Press “Run now” to create the first one.</p>;
  return (
    <ul className="space-y-3">
      {digests.map((d) => (
        <Entry key={d.id} d={d} />
      ))}
    </ul>
  );
}
