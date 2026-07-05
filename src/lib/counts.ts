export type StatusCount = { status: string; count: number };

// Groups by whatever status strings actually show up in the data -- no
// hardcoded bucket list, since this project has already been burned once by
// assuming a status value ('scheduled') instead of checking the real data.
export function countByStatus(rows: { status: string }[]): StatusCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => ({ status, count }));
}
