import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "fs";
import { join } from "path";

export function findUnprocessedSessions(rawDir: string): string[] {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir).filter((entry) => {
    const entryPath = join(rawDir, entry);
    if (!statSync(entryPath).isDirectory()) return false;
    return !existsSync(join(entryPath, ".completed"));
  });
}

export function findPendingReviews(reviewsDir: string): string[] {
  if (!existsSync(reviewsDir)) return [];
  return readdirSync(reviewsDir).filter((f) => f.endsWith(".md"));
}

export function markSessionCompleted(sessionDir: string): void {
  writeFileSync(join(sessionDir, ".completed"), new Date().toISOString(), "utf-8");
}

export function isSessionCompleted(sessionDir: string): boolean {
  return existsSync(join(sessionDir, ".completed"));
}

export function mergeReviewsIntoDaily(reviewPaths: string[], dailyPath: string): void {
  const reviewContents = reviewPaths
    .map((p) => readFileSync(p, "utf-8").trim())
    .filter((c) => c.length > 0);

  if (reviewContents.length === 0) {
    if (!existsSync(dailyPath)) {
      writeFileSync(dailyPath, "", "utf-8");
    }
    return;
  }

  let existing = "";
  if (existsSync(dailyPath)) {
    existing = readFileSync(dailyPath, "utf-8");
  }

  const merged = existing
    ? existing.trimEnd() + "\n\n" + reviewContents.join("\n\n") + "\n"
    : reviewContents.join("\n\n") + "\n";

  writeFileSync(dailyPath, merged, "utf-8");
}
