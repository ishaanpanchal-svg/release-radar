// Generates docs/components-map.svg and docs/components-map.png.   Run: node tools/make_components_map.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const W = 1434, HEAD = 70, LABEL = 175, LANE = 118, COLW = (W - LABEL - 15) / 6;
const cols = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const lanes = [
  ["Vercel Cron", "Schedule"],
  ["Keerthi", "Dashboard"],
  ["Resend", "Email"],
  ["Supabase", "Database"],
  ["Server", "Vercel + rules"],
  ["GitHub", "Live data"],
  ["Gemini", "Flash models"],
];
const C = {
  grey: { f: "#f3f0ea", s: "#6b6760", t: "#33312d" },
  purple: { f: "#eeeafc", s: "#4f46c8", t: "#352b8f" },
  green: { f: "#e4f5ee", s: "#0f7a5a", t: "#0b4f3a" },
  blue: { f: "#e6f0fb", s: "#1f5fa8", t: "#123f73" },
  orange: { f: "#fbebd5", s: "#9a5a12", t: "#633708" },
  red: { f: "#fbe9e4", s: "#a3361c", t: "#6b2412" },
  lime: { f: "#e8f4dc", s: "#3f7a12", t: "#264d0a" },
};
const bw = 184, bh = 84;
const cx = (c) => LABEL + COLW * (c + 0.5);
const cy = (r) => HEAD + LANE * (r + 0.5);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const boxes = {
  cron: { c: 0, r: 0, col: "grey", a: "Monday 08:00 IST", b: "weekly, automatic" },
  run: { c: 0, r: 1, col: "lime", a: "Run now button", b: "any day, any time" },
  edit: { c: 2, r: 1, col: "lime", a: "Paste a repo link", b: "add / delete, no code" },
  inbox: { c: 5, r: 1, col: "lime", a: "Dashboard + inbox", b: "5-minute scan" },
  email: { c: 5, r: 2, col: "red", a: "Weekly email", b: "red section first" },
  repos: { c: 2, r: 3, col: "green", a: "Tracked repo list", b: "20+ repos, editable" },
  db: { c: 5, r: 3, col: "green", a: "Digest + email log", b: "last email sent at..." },
  rules: { c: 3, r: 4, col: "blue", a: "Fixed rules", b: "CVE, breaking, filters" },
  merge: { c: 5, r: 4, col: "blue", a: "Merge + colour", b: "red / yellow / green" },
  gh: { c: 1, r: 5, col: "purple", a: "Releases + tags", b: "last 7 days only" },
  adv: { c: 2, r: 5, col: "purple", a: "Security advisories", b: "extra signal" },
  ai: { c: 4, r: 6, col: "orange", a: "Gemini Flash", b: "summary + judgement" },
};

// [from, fromSide, to, toSide, mode]  modes: h, v straight; hv = horizontal then vertical
const arrows = [
  ["cron", "r", "gh", "t", "hv"],
  ["run", "r", "gh", "t", "hv"],
  ["edit", "b", "repos", "t", "v"],
  ["gh", "r", "adv", "l", "h"],
  ["adv", "r", "rules", "b", "hv"],
  ["repos", "r", "rules", "t", "hv"],
  ["rules", "r", "ai", "t", "hv"],
  ["rules", "r", "merge", "l", "h"],
  ["ai", "r", "merge", "b", "hv"],
  ["merge", "t", "db", "b", "v"],
  ["db", "t", "email", "b", "v"],
  ["email", "t", "inbox", "b", "v"],
];

const BAND = 280;
const H = HEAD + LANE * lanes.length + BAND;
let s = "";
const out = (x) => (s += x + "\n");

out(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`);
out(`<title>Release Radar: components map and deployment</title>`);
out(`<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6b7280"/></marker></defs>`);
out(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
out(`<rect x="0" y="0" width="${W}" height="${HEAD}" fill="#1f2a3a"/>`);
out(`<text x="${LABEL / 2}" y="${HEAD / 2 + 6}" text-anchor="middle" font-size="19" fill="#9aa5b5">Actor</text>`);
cols.forEach((n, i) => out(`<text x="${cx(i)}" y="${HEAD / 2 + 8}" text-anchor="middle" font-size="25" font-weight="700" fill="#ffffff">${n}</text>`));

lanes.forEach((l, r) => {
  const y = HEAD + LANE * r;
  out(`<rect x="${LABEL}" y="${y}" width="${W - LABEL}" height="${LANE}" fill="${r % 2 ? "#f5f3ee" : "#ffffff"}"/>`);
  out(`<rect x="0" y="${y}" width="${LABEL}" height="${LANE}" fill="#1f2a3a"/>`);
  out(`<text x="${LABEL / 2}" y="${y + LANE / 2 - 2}" text-anchor="middle" font-size="24" font-weight="700" fill="#ffffff">${esc(l[0])}</text>`);
  out(`<text x="${LABEL / 2}" y="${y + LANE / 2 + 24}" text-anchor="middle" font-size="18" fill="#aab4c3">${esc(l[1])}</text>`);
});
for (let i = 1; i <= 6; i++) {
  const x = LABEL + COLW * i - (i === 6 ? 15 : 0);
  out(`<line x1="${x}" y1="${HEAD}" x2="${x}" y2="${HEAD + LANE * lanes.length}" stroke="#d9d5cc" stroke-width="1.5"/>`);
}

const edge = (b, side) => {
  const x = cx(b.c), y = cy(b.r);
  return { l: [x - bw / 2, y], r: [x + bw / 2, y], t: [x, y - bh / 2], b: [x, y + bh / 2] }[side];
};
arrows.forEach(([f, fs_, t, ts, mode]) => {
  const p = edge(boxes[f], fs_), q = edge(boxes[t], ts);
  const d = mode === "hv" ? `M${p[0]},${p[1]} L${q[0]},${p[1]} L${q[0]},${q[1]}` : `M${p[0]},${p[1]} L${q[0]},${q[1]}`;
  out(`<path d="${d}" fill="none" stroke="#6b7280" stroke-width="2.4" stroke-dasharray="7 5" marker-end="url(#ah)"/>`);
});

Object.values(boxes).forEach((b) => {
  const k = C[b.col], x = cx(b.c) - bw / 2, y = cy(b.r) - bh / 2;
  out(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="${k.f}" stroke="${k.s}" stroke-width="3"/>`);
  out(`<text x="${cx(b.c)}" y="${cy(b.r) - 4}" text-anchor="middle" font-size="18" font-weight="700" fill="${k.t}">${esc(b.a)}</text>`);
  out(`<text x="${cx(b.c)}" y="${cy(b.r) + 20}" text-anchor="middle" font-size="15.5" fill="${k.t}" opacity="0.85">${esc(b.b)}</text>`);
});

// ---- deployment band
const by = HEAD + LANE * lanes.length;
out(`<rect x="0" y="${by}" width="${W}" height="${BAND}" fill="#f7f6f2"/>`);
out(`<line x1="0" y1="${by}" x2="${W}" y2="${by}" stroke="#cfcac0" stroke-width="2"/>`);
out(`<text x="30" y="${by + 36}" font-size="22" font-weight="700" fill="#1f2a3a">Where it runs (deployment)</text>`);
const chip = (x, y, w, h, col, a, b) => {
  const k = C[col];
  out(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${k.f}" stroke="${k.s}" stroke-width="2.5"/>`);
  out(`<text x="${x + w / 2}" y="${y + 29}" text-anchor="middle" font-size="17" font-weight="700" fill="${k.t}">${esc(a)}</text>`);
  out(`<text x="${x + w / 2}" y="${y + 53}" text-anchor="middle" font-size="14.5" fill="${k.t}" opacity="0.85">${esc(b)}</text>`);
};
const arrow = (x1, y1, x2, y2) => out(`<path d="M${x1},${y1} L${x2},${y2}" stroke="#6b7280" stroke-width="2.4" stroke-dasharray="7 5" marker-end="url(#ah)"/>`);
const cy1 = by + 62, ch = 70;
chip(30, cy1, 300, ch, "grey", "GitHub (public repo)", "ishaanpanchal-svg/release-radar");
arrow(330, cy1 + ch / 2, 390, cy1 + ch / 2);
out(`<text x="360" y="${cy1 - 8}" text-anchor="middle" font-size="13" fill="#6b6760">push = deploy</text>`);
chip(390, cy1, 330, ch, "blue", "Vercel (free plan)", "release-radar-red.vercel.app");
arrow(720, cy1 + ch / 2, 780, cy1 + ch / 2);
out(`<text x="750" y="${cy1 - 8}" text-anchor="middle" font-size="13" fill="#6b6760">reads / writes</text>`);
chip(780, cy1, 290, ch, "green", "Supabase (free plan)", "repos, digests, digest_items");
chip(1100, cy1, 300, ch, "purple", "External services", "GitHub API, Gemini Flash, Resend");

const ly = by + 160;
const note = (y, bold, text) => out(`<text x="30" y="${y}" font-size="15" fill="#33312d"><tspan font-weight="700">${esc(bold)}</tspan> ${esc(text)}</text>`);
note(ly, "Schedule:", "vercel.json cron 30 2 * * 1 = Monday 02:30 UTC = 08:00 IST. The route needs CRON_SECRET and will not send twice in one week.");
note(ly + 22, "AI:", "every AI call is a Gemini Flash model (3.8, 3.7, 3.6, 3.5, then Flash-Lite). Free tier is 20 calls/day per model, so answers are cached per release.");
note(ly + 44, "Safe to be wrong:", "anything the AI or the rules disagree on is shown with a 'not sure' badge and is never green. If Gemini is down, rules still flag security and breaking.");
note(ly + 66, "Left out on purpose:", "issues, pull requests, comments, commits and alpha/beta/rc builds. The dashboard is public by design (no login).");
note(ly + 88, "Not built:", "Slack or Telegram delivery, per-user accounts, a custom sending domain (Resend free plan sends only to the signed-up address).");
out(`<text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="16" fill="#6b6760">Release Radar: components map and deployment</text>`);
out("</svg>");

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "components-map.svg"), s);
await sharp(Buffer.from(s), { density: 144 }).png().toFile(path.join(dir, "components-map.png"));
console.log("wrote docs/components-map.svg and .png", W + "x" + H);
