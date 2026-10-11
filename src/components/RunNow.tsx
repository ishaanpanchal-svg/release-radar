"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunNow() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "err", text: data.error ?? "Something went wrong. Please try again." });
      } else if (email && data.email && !data.email.ok) {
        setMessage({ tone: "warn", text: `Digest is ready, but the email could not be sent: ${data.email.error}` });
        router.refresh();
      } else {
        setMessage({ tone: "ok", text: email ? "Done. The digest is ready and the email has been sent." : "Done. The digest is ready." });
        router.refresh();
      }
    } catch {
      setMessage({ tone: "err", text: "Could not reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const tone = { ok: "text-emerald-700", warn: "text-amber-700", err: "text-red-700" };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          Look back
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={busy}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} disabled={busy} className="h-4 w-4" />
          Email me too
        </label>
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-wait disabled:bg-gray-500"
        >
          {busy ? "Running…" : "▶ Run now"}
        </button>
      </div>
      {busy && <p className="text-xs text-gray-500">Checking GitHub and summarising with Gemini. This usually takes under a minute.</p>}
      {message && <p className={`max-w-md text-sm font-medium ${tone[message.tone]}`}>{message.text}</p>}
    </div>
  );
}
