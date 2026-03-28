// src/core/vault.ts
import type { StorageAdapter } from "./storage.js";
import type { Periods } from "./config.js";

export function getRawDir(sessionId: string): string {
  return `.raw/${sessionId}`;
}

export function getReviewsDir(): string {
  return ".reviews";
}

export function getDailyPath(date: string): string {
  return `daily/${date}.md`;
}

export function getWeeklyPath(week: string): string {
  return `weekly/${week}.md`;
}

export function getMonthlyPath(month: string): string {
  return `monthly/${month}.md`;
}

export function getQuarterlyPath(quarter: string): string {
  return `quarterly/${quarter}.md`;
}

export function getYearlyPath(year: string): string {
  return `yearly/${year}.md`;
}

export function getProjectDailyPath(projectName: string, date: string): string {
  return `projects/${projectName}/${date}.md`;
}

export function getProjectSummaryPath(projectName: string): string {
  return `projects/${projectName}/summary.md`;
}

export function getUncategorizedPath(date: string): string {
  return `uncategorized/${date}.md`;
}

export async function ensureVaultDirectories(storage: StorageAdapter, periods: Periods): Promise<void> {
  const dirs = ["daily", "projects", "uncategorized", ".raw", ".reviews"];
  if (periods.weekly) dirs.push("weekly");
  if (periods.monthly) dirs.push("monthly");
  if (periods.quarterly) dirs.push("quarterly");
  if (periods.yearly) dirs.push("yearly");

  for (const dir of dirs) {
    await storage.mkdir(dir);
  }
}
