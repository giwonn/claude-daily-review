import { mkdirSync } from "fs";
import { join } from "path";
import type { Config } from "./config.js";

export function getReviewBasePath(config: Config): string {
  return join(config.vaultPath, config.reviewFolder);
}

export function getRawDir(config: Config, sessionId: string): string {
  return join(getReviewBasePath(config), ".raw", sessionId);
}

export function getReviewsDir(config: Config): string {
  return join(getReviewBasePath(config), ".reviews");
}

export function getDailyPath(config: Config, date: string): string {
  return join(getReviewBasePath(config), "daily", `${date}.md`);
}

export function getWeeklyPath(config: Config, week: string): string {
  return join(getReviewBasePath(config), "weekly", `${week}.md`);
}

export function getMonthlyPath(config: Config, month: string): string {
  return join(getReviewBasePath(config), "monthly", `${month}.md`);
}

export function getQuarterlyPath(config: Config, quarter: string): string {
  return join(getReviewBasePath(config), "quarterly", `${quarter}.md`);
}

export function getYearlyPath(config: Config, year: string): string {
  return join(getReviewBasePath(config), "yearly", `${year}.md`);
}

export function getProjectDailyPath(config: Config, projectName: string, date: string): string {
  return join(getReviewBasePath(config), "projects", projectName, `${date}.md`);
}

export function getProjectSummaryPath(config: Config, projectName: string): string {
  return join(getReviewBasePath(config), "projects", projectName, "summary.md");
}

export function getUncategorizedPath(config: Config, date: string): string {
  return join(getReviewBasePath(config), "uncategorized", `${date}.md`);
}

export function ensureVaultDirectories(config: Config): void {
  const base = getReviewBasePath(config);
  const dirs = [
    join(base, "daily"),
    join(base, "projects"),
    join(base, "uncategorized"),
    join(base, ".raw"),
    join(base, ".reviews"),
  ];

  if (config.periods.weekly) dirs.push(join(base, "weekly"));
  if (config.periods.monthly) dirs.push(join(base, "monthly"));
  if (config.periods.quarterly) dirs.push(join(base, "quarterly"));
  if (config.periods.yearly) dirs.push(join(base, "yearly"));

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}
