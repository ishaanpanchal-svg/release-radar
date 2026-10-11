import type { AiResult } from "./gemini";
import type { AdvisoryInfo, Importance, RawRelease } from "./types";
import type { RuleResult } from "./rules";

export interface Classified {
  importance: Importance;
  unsure: boolean;
  is_security: boolean;
  is_breaking: boolean;
  summary: string;
  key_changes: string[];
  evidence: string[];
  reason: string;
  ai_status: "ok" | "failed" | "no_notes";
}

export const MIN_USEFUL_NOTES = 25;

function fallbackSummary(release: RawRelease): string {
  const body = release.body.replace(/\s+/g, " ").trim();
  if (!body) {
    return release.tagOnly
      ? "A new version tag was pushed but no release notes were published. Open the tag to check what changed."
      : "No release notes were published for this version. Open the release to check what changed.";
  }
  return body.length > 260 ? body.slice(0, 259) + "…" : body;
}

/**
 * Combines the fixed rules with the AI's judgement.
 * Principle: it is better to show something that turns out harmless than to hide something that matters.
 */
export function mergeClassification(
  release: RawRelease,
  rules: RuleResult,
  ai: AiResult | undefined,
  advisories: AdvisoryInfo[],
): Classified {
  const noNotes = release.body.trim().length < MIN_USEFUL_NOTES;
  const advisoryHit = advisories.length > 0;

  const is_security = rules.securityStrong || advisoryHit || (ai?.is_security ?? false);
  const is_breaking = rules.breakingStrong || (ai?.is_breaking ?? false);

  let importance: Importance;
  if (is_security || is_breaking) importance = "red";
  else if (
    ai?.importance === "yellow" ||
    rules.majorBump ||
    rules.deprecation ||
    rules.breakingWeak ||
    rules.securityWeak
  )
    importance = "yellow";
  else importance = ai?.importance === "red" ? "yellow" : "green";

  // Reasons we are not confident. Any one of them marks the item "unsure".
  const doubts: string[] = [];
  if (!ai && !noNotes) doubts.push("The AI could not read this release");
  if (ai && ai.confidence === "low") doubts.push("The AI was not confident");
  if (noNotes) doubts.push("Release notes are empty or very short");
  if (ai && rules.securityStrong && !ai.is_security) doubts.push("Rules found security wording but the AI did not call it a security fix");
  if (ai && rules.breakingStrong && !ai.is_breaking) doubts.push("Rules found breaking-change wording but the AI did not call it breaking");
  if (ai && !rules.securityStrong && !advisoryHit && ai.is_security) doubts.push("The AI called it a security fix but the notes carry no CVE or advisory id");
  if (ai && !rules.breakingStrong && ai.is_breaking && !rules.majorBump) doubts.push("The AI called it breaking but the notes do not say so explicitly");
  const unsure = doubts.length > 0;

  // Unsure items are never allowed to look harmless.
  if (unsure && importance === "green") importance = "yellow";

  const evidence = [
    ...(ai?.evidence ?? []).map((q) => `"${q}"`),
    ...rules.evidence.filter((e) => !e.includes("(weak)")),
    ...advisories.map((a) => `Advisory ${a.ghsaId}${a.cveId ? " / " + a.cveId : ""}${a.severity ? " (" + a.severity + ")" : ""}: ${a.summary}`),
  ].slice(0, 6);

  const reasonBits: string[] = [];
  if (ai?.reason) reasonBits.push(ai.reason);
  if (doubts.length) reasonBits.push(`Needs a human look: ${doubts.join("; ")}.`);

  return {
    importance,
    unsure,
    is_security,
    is_breaking,
    summary: ai?.summary?.trim() || fallbackSummary(release),
    key_changes: ai?.key_changes?.slice(0, 4) ?? [],
    evidence,
    reason: reasonBits.join(" "),
    ai_status: noNotes ? "no_notes" : !ai ? "failed" : "ok",
  };
}
