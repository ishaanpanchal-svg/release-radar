/**
 * Fixed rules that run on every release, independent of the AI.
 * They exist so a security fix or breaking change cannot be missed just because the AI model had a bad day.
 */

export interface RuleResult {
  securityStrong: boolean;
  securityWeak: boolean;
  breakingStrong: boolean;
  breakingWeak: boolean;
  deprecation: boolean;
  majorBump: boolean;
  evidence: string[];
}

const SECURITY_STRONG: RegExp[] = [
  /\bCVE-\d{4}-\d{4,}\b/i,
  /\bGHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/i,
  /\bsecurity\s+(fix|fixes|patch|patches|update|release|advisory|advisories|issue|issues|vulnerabilit\w+|hardening)\b/i,
  /\b(fix(es|ed)?|patch(es|ed)?|address(es|ed)?|resolve[sd]?)\b[^.\n]{0,60}\bvulnerabilit\w+/i,
  /\bvulnerabilit(y|ies)\b/i,
  /\b(XSS|CSRF|SSRF|RCE|XXE|SQL injection|command injection|code injection)\b/,
  /\b(remote code execution|privilege escalation|authentication bypass|auth(entication)? bypass|path traversal|prototype pollution|open redirect|denial[- ]of[- ]service|timing attack|signature (bypass|verification))\b/i,
];

const SECURITY_WEAK: RegExp[] = [/\bsecurity\b/i, /\b(sanitiz|escap)\w*/i, /\bexploit/i, /\b(token|secret|credential)s?\s+(leak|exposure|exposed)/i];

const BREAKING_STRONG: RegExp[] = [
  /\bbreaking(\s+changes?)?\b/i,
  /\bbackwards?[- ]incompatib/i,
  /\bincompatible (change|with)/i,
  /\bno longer (supports?|works?|accepts?|exports?)\b/i,
  /\bdrop(s|ped|ping)?\s+support\b/i,
  /\bremoved?\s+support\b/i,
];

// "No breaking changes" and "non-breaking" must not count as breaking.
const NEGATED_BREAKING = /\b(no|non|not|without|zero)[- ](\w+ )?breaking\b/i;

const BREAKING_WEAK: RegExp[] = [/\bmigrat(e|ion)\b/i, /\bremoved?\b/i, /\brenamed?\b/i, /\bchanged?\s+(the\s+)?default/i, /\brequires?\s+(node|python|java|go|php|ruby|\.net)\b/i];

const DEPRECATION: RegExp[] = [/\bdeprecat\w+/i, /\bend[- ]of[- ]life\b/i, /\bEOL\b/];

function clip(s: string, n = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function isMajorBump(tag: string, prerelease: boolean): boolean {
  if (prerelease) return false;
  const m = tag.match(/^[^\d]*(\d+)\.(\d+)\.(\d+)(?![\d.])/);
  if (!m) return false;
  const [, major, minor, patch] = m;
  return Number(major) >= 1 && Number(minor) === 0 && Number(patch) === 0;
}

export function analyzeRelease(tag: string, body: string, prerelease: boolean): RuleResult {
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  const evidence: string[] = [];
  const seen = new Set<string>();
  const addEvidence = (label: string, line: string) => {
    const key = line.trim();
    if (seen.has(key) || evidence.length >= 6) return;
    seen.add(key);
    evidence.push(`${label}: ${clip(line)}`);
  };

  const test = (patterns: RegExp[], label: string, collect: boolean, skip?: RegExp): boolean => {
    let hit = false;
    for (const line of lines) {
      if (skip && skip.test(line)) continue;
      if (patterns.some((p) => p.test(line))) {
        hit = true;
        if (collect) addEvidence(label, line);
        else break;
      }
    }
    return hit;
  };

  const securityStrong = test(SECURITY_STRONG, "Security", true);
  const securityWeak = securityStrong || test(SECURITY_WEAK, "Security (weak)", false);
  const breakingStrong = test(BREAKING_STRONG, "Breaking", true, NEGATED_BREAKING);
  const breakingWeak = breakingStrong || test(BREAKING_WEAK, "Breaking (weak)", false);
  const deprecation = test(DEPRECATION, "Deprecation", false);
  const majorBump = isMajorBump(tag, prerelease);
  if (majorBump) evidence.push(`Version ${tag} looks like a major release`);

  return { securityStrong, securityWeak, breakingStrong, breakingWeak, deprecation, majorBump, evidence };
}
