import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getLatestDigest } from "@/lib/digest";
import { fmtDateTime, greeting, nextScheduledRun } from "@/lib/format";
import type { DigestRow, RepoRow } from "@/lib/types";
import { DigestView } from "@/components/DigestView";
import { History } from "@/components/History";
import { RepoManager } from "@/components/RepoManager";
import { RunNow } from "@/components/RunNow";

function maskEmail(email: string | undefined): string {
  if (!email || !email.includes("@")) return "your email";
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Suspense
        fallback={
          <div className="space-y-3 py-6">
            <div className="h-9 w-72 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-gray-200" />
            <p className="pt-6 text-sm text-gray-500">Loading your dashboard…</p>
          </div>
        }
      >
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  await connection(); // always render fresh data at request time

  const [reposRes, historyRes, lastEmailRes, latest] = await Promise.all([
    db().from("repos").select("*").order("full_name"),
    db().from("digests").select("*").order("created_at", { ascending: false }).limit(15),
    db().from("digests").select("*").not("email_status", "is", null).order("created_at", { ascending: false }).limit(1),
    getLatestDigest(),
  ]);

  const repos = (reposRes.data ?? []) as RepoRow[];
  const history = (historyRes.data ?? []) as DigestRow[];
  const lastEmail = ((lastEmailRes.data ?? []) as DigestRow[])[0];
  const now = new Date();

  return (
    <>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {greeting(now)}, Keerthi 👋
          </h1>
          <p className="text-gray-600">Here is what shipped across the {repos.length} repositories you depend on.</p>
          <div className="space-y-0.5 text-sm">
            {lastEmail?.email_status === "sent" && lastEmail.email_sent_at ? (
              <p className="font-medium text-emerald-700">
                ✉ Last email sent: {fmtDateTime(lastEmail.email_sent_at)} to {maskEmail(lastEmail.email_to ?? process.env.DIGEST_TO_EMAIL)}
              </p>
            ) : lastEmail?.email_status === "failed" ? (
              <p className="font-medium text-red-700">✉ The last email could not be sent{lastEmail.email_error ? `: ${lastEmail.email_error}` : ""}</p>
            ) : (
              <p className="text-gray-500">✉ No email sent yet</p>
            )}
            <p className="text-gray-500">Next automatic email: {fmtDateTime(nextScheduledRun(now))}</p>
          </div>
        </div>
        <RunNow />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-bold">Change log</h2>
            {latest && <p className="mt-1 text-sm font-medium text-gray-800">{latest.digest.headline}</p>}
          </div>
          {latest ? (
            <DigestView digest={latest.digest} items={latest.items} />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
              No digest yet. Press <strong>Run now</strong> to build the first one.
            </div>
          )}
        </section>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xl font-bold">Tracked repositories ({repos.length})</h2>
          <RepoManager repos={repos} />
        </aside>
      </div>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-bold">Past digests</h2>
        <History digests={history} />
      </section>

      <footer className="mt-12 border-t border-gray-200 pt-4 text-xs text-gray-500">
        Live data from the GitHub API · summaries by Gemini Flash · scheduled every Monday at 8:00 AM IST.
      </footer>
    </>
  );
}
