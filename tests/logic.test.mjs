// Run with: npm test   (Node 24 runs the .ts source files directly)
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRelease, isMajorBump } from "../src/lib/rules.ts";
import { advisoryAppliesTo, isPrereleaseTag, parseRepoInput } from "../src/lib/github.ts";

test("parseRepoInput understands every way a link can be pasted", () => {
  const ok = { owner: "stripe", name: "stripe-node" };
  assert.deepEqual(parseRepoInput("https://github.com/stripe/stripe-node"), ok);
  assert.deepEqual(parseRepoInput("github.com/stripe/stripe-node/"), ok);
  assert.deepEqual(parseRepoInput("stripe/stripe-node"), ok);
  assert.deepEqual(parseRepoInput("https://github.com/stripe/stripe-node.git"), ok);
  assert.deepEqual(parseRepoInput("git@github.com:stripe/stripe-node.git"), ok);
  assert.deepEqual(parseRepoInput("https://github.com/stripe/stripe-node/releases/tag/v1.0.0"), ok);
  assert.deepEqual(parseRepoInput("https://www.github.com/stripe/stripe-node?tab=readme"), ok);
});

test("parseRepoInput rejects things that are not GitHub repos", () => {
  for (const bad of ["", "hello", "https://gitlab.com/a/b", "https://github.com/onlyowner", "just some words", "https://github.com/-bad-/x", "https://github.com/a/../b"]) {
    assert.equal(parseRepoInput(bad), null, `should reject: ${bad}`);
  }
});

test("pre-release tags are recognised, stable tags are not", () => {
  for (const t of ["v8.0.0-rc.17", "v7.3-rc6", "v2.118.0-canary.0", "v23.1.0-alpha.2", "v16.1.0a2", "openssl-4.1.0-beta2", "1.0.0-next.4"]) {
    assert.equal(isPrereleaseTag(t), true, t);
  }
  for (const t of ["v5.3.0", "openssl-3.4.8", "@hono/vercel@1.0.1", "v4.13.11", "0.45.4", "release-candidate-notes-fix"]) {
    assert.equal(isPrereleaseTag(t), false, t);
  }
});

test("major version bumps", () => {
  assert.equal(isMajorBump("v23.0.0", false), true);
  assert.equal(isMajorBump("v5.3.0", false), false);
  assert.equal(isMajorBump("v5.3.1", false), false);
  assert.equal(isMajorBump("v6.0.0-rc.1", true), false);
});

test("security wording is caught", () => {
  const cases = [
    "Upgrade qs to ^6.16.0, which fixes CVE-2026-2391",
    "Fixes a middleware bypass vulnerability (GHSA-5r4p-p66f-jhc7)",
    "This adds Object prototype pollution guards to prevent remote code execution.",
    "OpenSSL 3.5.9 is a security patch release.",
    "Fixed an XSS issue in the login form",
  ];
  for (const body of cases) assert.equal(analyzeRelease("v1.2.3", body, false).securityStrong, true, body);
});

test("harmless notes do not raise security or breaking flags", () => {
  const body = "Fix typo in README\nUpdate peer dependency ranges\nThis release has no breaking changes.\nNon-breaking refactor of internal types";
  const r = analyzeRelease("v1.2.3", body, false);
  assert.equal(r.securityStrong, false);
  assert.equal(r.breakingStrong, false);
});

test("breaking wording is caught", () => {
  for (const body of ["BREAKING CHANGE: the client constructor now requires an API key", "Dropped support for Node 18", "This version is backwards incompatible with 1.x"]) {
    assert.equal(analyzeRelease("v2.0.0", body, false).breakingStrong, true, body);
  }
});

test("an advisory attaches only to the release that fixes it", () => {
  const adv = { ghsaId: "GHSA-5r4p-p66f-jhc7", cveId: "CVE-2026-1", severity: "medium", summary: "x", url: "u", patched: ["4.13.11"] };
  assert.equal(advisoryAppliesTo(adv, { tag: "v4.13.11", body: "" }), true, "patched version matches the tag");
  assert.equal(advisoryAppliesTo(adv, { tag: "v4.13.12", body: "routine fixes" }), false, "later unrelated release");
  assert.equal(advisoryAppliesTo(adv, { tag: "@hono/vercel@1.0.1", body: "peer deps" }), false, "monorepo sub-package");
  assert.equal(advisoryAppliesTo(adv, { tag: "v9.9.9", body: "Fixes GHSA-5R4P-P66F-JHC7" }), true, "release names the advisory");
});
