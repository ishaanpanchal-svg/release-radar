const TZ = "Asia/Kolkata";

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d) + " IST"
  );
}

export function fmtDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
}

export function fmtDayYear(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Next Monday 08:00 IST (= Monday 02:30 UTC), the time the weekly email is scheduled. */
export function nextScheduledRun(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 30, 0));
  const add = (1 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export function greeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(now)) % 24;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
