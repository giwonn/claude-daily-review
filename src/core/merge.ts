// src/core/merge.ts
import type { StorageAdapter } from "./storage.js";

export async function findUnprocessedSessions(storage: StorageAdapter, rawDir: string): Promise<string[]> {
  if (!(await storage.exists(rawDir))) return [];
  const entries = await storage.list(rawDir);
  const results: string[] = [];
  for (const entry of entries) {
    const entryPath = `${rawDir}/${entry}`;
    if (!(await storage.isDirectory(entryPath))) continue;
    if (await storage.exists(`${entryPath}/.completed`)) continue;
    results.push(entry);
  }
  return results;
}

export async function findPendingReviews(storage: StorageAdapter, reviewsDir: string): Promise<string[]> {
  if (!(await storage.exists(reviewsDir))) return [];
  const entries = await storage.list(reviewsDir);
  return entries.filter((f) => f.endsWith(".md"));
}

export async function markSessionCompleted(storage: StorageAdapter, sessionDir: string): Promise<void> {
  await storage.write(`${sessionDir}/.completed`, new Date().toISOString());
}

export async function isSessionCompleted(storage: StorageAdapter, sessionDir: string): Promise<boolean> {
  return storage.exists(`${sessionDir}/.completed`);
}

export async function mergeReviewsIntoDaily(storage: StorageAdapter, reviewPaths: string[], dailyPath: string): Promise<void> {
  const reviewContents: string[] = [];
  for (const p of reviewPaths) {
    const content = await storage.read(p);
    if (content && content.trim().length > 0) {
      reviewContents.push(content.trim());
    }
  }

  if (reviewContents.length === 0) {
    if (!(await storage.exists(dailyPath))) {
      await storage.write(dailyPath, "");
    }
    return;
  }

  const existing = await storage.read(dailyPath);
  const merged = existing
    ? existing.trimEnd() + "\n\n" + reviewContents.join("\n\n") + "\n"
    : reviewContents.join("\n\n") + "\n";

  await storage.write(dailyPath, merged);
}
