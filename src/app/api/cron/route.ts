import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDigest } from "@/lib/digest";
import { sendDigestEmail } from "@/lib/email";

export const maxDuration = 300;

/** Called by Vercel Cron every Monday 08:00 IST. Vercel sends "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cron delivery can repeat. Never send the weekly digest twice in the same week.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await db()
    .from("digests")
    .select("id")
    .eq("kind", "scheduled")
    .gte("created_at", fiveDaysAgo)
    .limit(1);
  if (recent?.length) return NextResponse.json({ skipped: "A scheduled digest already ran this week", digestId: recent[0].id });

  try {
    const { digestId } = await runDigest({ kind: "scheduled", days: 7 });
    const email = await sendDigestEmail(digestId);
    return NextResponse.json({ digestId, email });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 500 });
  }
}
