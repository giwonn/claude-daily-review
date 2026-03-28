import { describe, it, expect } from "vitest";
import {
  getISOWeek,
  getISOWeekYear,
  getQuarter,
  formatDate,
  formatWeek,
  formatMonth,
  formatQuarter,
  formatYear,
  checkPeriodsNeeded,
} from "../../src/core/periods.js";

describe("periods", () => {
  describe("getISOWeek", () => {
    it("returns week 1 for 2026-01-01 (Thursday)", () => {
      expect(getISOWeek(new Date(2026, 0, 1))).toBe(1);
    });

    it("returns week 53 for 2020-12-31 (Thursday of W53)", () => {
      expect(getISOWeek(new Date(2020, 11, 31))).toBe(53);
    });

    it("returns week 13 for 2026-03-28 (Saturday)", () => {
      expect(getISOWeek(new Date(2026, 2, 28))).toBe(13);
    });
  });

  describe("getISOWeekYear", () => {
    it("returns 2026 for 2026-01-01", () => {
      expect(getISOWeekYear(new Date(2026, 0, 1))).toBe(2026);
    });

    it("returns previous year for dates in week 1 belonging to prev year", () => {
      // 2025-12-29 is Monday of W01 of 2026
      expect(getISOWeekYear(new Date(2025, 11, 29))).toBe(2026);
    });
  });

  describe("getQuarter", () => {
    it("returns Q1 for January", () => {
      expect(getQuarter(new Date(2026, 0, 15))).toBe(1);
    });

    it("returns Q1 for March", () => {
      expect(getQuarter(new Date(2026, 2, 28))).toBe(1);
    });

    it("returns Q2 for April", () => {
      expect(getQuarter(new Date(2026, 3, 1))).toBe(2);
    });

    it("returns Q4 for December", () => {
      expect(getQuarter(new Date(2026, 11, 31))).toBe(4);
    });
  });

  describe("formatDate", () => {
    it("formats as YYYY-MM-DD", () => {
      expect(formatDate(new Date(2026, 2, 28))).toBe("2026-03-28");
    });

    it("zero-pads single digit months and days", () => {
      expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
  });

  describe("formatWeek", () => {
    it("formats as YYYY-Www", () => {
      expect(formatWeek(new Date(2026, 2, 28))).toBe("2026-W13");
    });

    it("zero-pads single digit weeks", () => {
      expect(formatWeek(new Date(2026, 0, 5))).toBe("2026-W02");
    });
  });

  describe("formatMonth", () => {
    it("formats as YYYY-MM", () => {
      expect(formatMonth(new Date(2026, 2, 28))).toBe("2026-03");
    });
  });

  describe("formatQuarter", () => {
    it("formats as YYYY-Qn", () => {
      expect(formatQuarter(new Date(2026, 2, 28))).toBe("2026-Q1");
    });
  });

  describe("formatYear", () => {
    it("formats as YYYY", () => {
      expect(formatYear(new Date(2026, 2, 28))).toBe("2026");
    });
  });

  describe("checkPeriodsNeeded", () => {
    it("returns all false when same day", () => {
      const today = new Date(2026, 2, 28);
      const lastRun = new Date(2026, 2, 28);
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsWeekly).toBe(false);
      expect(result.needsMonthly).toBe(false);
      expect(result.needsQuarterly).toBe(false);
      expect(result.needsYearly).toBe(false);
    });

    it("detects new week", () => {
      const today = new Date(2026, 2, 30); // Monday W14
      const lastRun = new Date(2026, 2, 28); // Saturday W13
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsWeekly).toBe(true);
      expect(result.previousWeek).toBe("2026-W13");
    });

    it("detects new month", () => {
      const today = new Date(2026, 3, 1); // April 1
      const lastRun = new Date(2026, 2, 31); // March 31
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsMonthly).toBe(true);
      expect(result.previousMonth).toBe("2026-03");
    });

    it("detects new quarter", () => {
      const today = new Date(2026, 3, 1); // April 1 = Q2
      const lastRun = new Date(2026, 2, 31); // March 31 = Q1
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsQuarterly).toBe(true);
      expect(result.previousQuarter).toBe("2026-Q1");
    });

    it("detects new year", () => {
      const today = new Date(2027, 0, 1);
      const lastRun = new Date(2026, 11, 31);
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsYearly).toBe(true);
      expect(result.previousYear).toBe("2026");
    });

    it("handles null lastRun (first run ever)", () => {
      const today = new Date(2026, 2, 28);
      const result = checkPeriodsNeeded(today, null);
      expect(result.needsWeekly).toBe(false);
      expect(result.needsMonthly).toBe(false);
      expect(result.needsQuarterly).toBe(false);
      expect(result.needsYearly).toBe(false);
    });

    it("detects multiple periods at once (new year = new month + quarter + year)", () => {
      const today = new Date(2027, 0, 5); // Jan 5 2027 (Monday W02)
      const lastRun = new Date(2026, 11, 28); // Dec 28 2026
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsWeekly).toBe(true);
      expect(result.needsMonthly).toBe(true);
      expect(result.needsQuarterly).toBe(true);
      expect(result.needsYearly).toBe(true);
    });
  });
});
