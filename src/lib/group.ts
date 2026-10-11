import type { Importance, ItemRow } from "./types";

export interface RepoGroup {
  repo: string;
  importance: Importance; // the most important release in the group
  unsure: boolean;
  items: ItemRow[];
}

const RANK: Record<Importance, number> = { red: 0, yellow: 1, green: 2 };

/** One card per repository, so a repo that shipped five releases (or a monorepo) reads as one entry. */
export function groupByRepo(items: ItemRow[]): RepoGroup[] {
  const map = new Map<string, ItemRow[]>();
  for (const i of items) map.set(i.repo_full_name, [...(map.get(i.repo_full_name) ?? []), i]);
  const groups: RepoGroup[] = [...map.entries()].map(([repo, list]) => {
    const sorted = [...list].sort(
      (a, b) => RANK[a.importance] - RANK[b.importance] || (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    );
    return {
      repo,
      importance: sorted[0].importance,
      unsure: sorted.some((i) => i.unsure),
      items: sorted,
    };
  });
  return groups.sort(
    (a, b) => RANK[a.importance] - RANK[b.importance] || Number(b.unsure) - Number(a.unsure) || a.repo.localeCompare(b.repo),
  );
}
