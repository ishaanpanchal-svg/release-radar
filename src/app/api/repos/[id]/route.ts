import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { error } = await db().from("repos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
