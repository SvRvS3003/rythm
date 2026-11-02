// TypeScript, client/queue.ts, browser and node: picks songs not yet in the queue, so a list can never hold the same song twice.
export function unseen<T extends { id: string }>(queue: T[], candidates: T[]): T[] {
  const have = new Set(queue.map(t => t.id));
  return candidates.filter(t => !have.has(t.id) && have.add(t.id));
}
