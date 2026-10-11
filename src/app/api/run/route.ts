import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDigest } from "@/lib/digest";
import { sendDigestEmail } from "@/lib/email";

export const maxDuration = 300;

const COOLDOWN_SECONDS = 45;
const ALLOWED_DAYS = [7, 14, 30, 90];

/** "Run now": build a digest immediately, optionally email it. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const days = ALLOWED_DAYS.includes(Number(body?.days)) ? Number(body.days) : 7;
  const sendEmail = body?.email !== false;

  // The dashboard is public, so a short cooldown stops accidental double clicks and abuse.
  const { data: last } = await db().from("digests").select("created_at").order("created_at", { ascending: false }).limit(1);
  if (last?.length) {
    const age = (Date.now() - new Date(last[0].created_at as string).getTime()) / 1000;
    if (age < COOLDOWN_SECONDS) {
      return NextResponse.json(
        { error: `A digest was just generated. Please wait ${Math.ceil(COOLDOWN_SECONDS - age)} seconds before running again.` },
        { status: 429 },
      );
    }
  }

  try {
    const { digestId } = await runDigest({ kind: "manual", days });
    const email = sendEmail ? await sendDigestEmail(digestId) : null;
    return NextResponse.json({ digestId, email });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 500 });
  }
}
