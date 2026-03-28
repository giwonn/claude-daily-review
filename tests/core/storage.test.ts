import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import type { StorageAdapter } from "../../src/core/storage.js";

describe("LocalStorageAdapter", () => {
  let tempDir: string;
  let storage: StorageAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-storage-"));
    storage = new LocalStorageAdapter(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("write + read", () => {
    it("writes and reads a file", async () => {
      await storage.write("test.txt", "hello");
      const content = await storage.read("test.txt");
      expect(content).toBe("hello");
    });

    it("creates parent directories on write", async () => {
      await storage.write("a/b/c.txt", "nested");
      const content = await storage.read("a/b/c.txt");
      expect(content).toBe("nested");
    });

    it("returns null for non-existent file", async () => {
      const content = await storage.read("nope.txt");
      expect(content).toBeNull();
    });
  });

  describe("append", () => {
    it("creates file if not exists", async () => {
      await storage.append("log.txt", "line1\n");
      const content = await storage.read("log.txt");
      expect(content).toBe("line1\n");
    });

    it("appends to existing file", async () => {
      await storage.append("log.txt", "line1\n");
      await storage.append("log.txt", "line2\n");
      const content = await storage.read("log.txt");
      expect(content).toBe("line1\nline2\n");
    });

    it("creates parent directories on append", async () => {
      await storage.append("deep/dir/log.txt", "data\n");
      const content = await storage.read("deep/dir/log.txt");
      expect(content).toBe("data\n");
    });
  });

  describe("exists", () => {
    it("returns false for non-existent path", async () => {
      expect(await storage.exists("nope")).toBe(false);
    });

    it("returns true for existing file", async () => {
      await storage.write("file.txt", "x");
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns true for existing directory", async () => {
      await storage.mkdir("mydir");
      expect(await storage.exists("mydir")).toBe(true);
    });
  });

  describe("list", () => {
    it("returns empty array for non-existent directory", async () => {
      expect(await storage.list("nope")).toEqual([]);
    });

    it("lists entries in directory", async () => {
      await storage.write("dir/a.txt", "a");
      await storage.write("dir/b.txt", "b");
      const entries = await storage.list("dir");
      expect(entries.sort()).toEqual(["a.txt", "b.txt"]);
    });
  });

  describe("mkdir", () => {
    it("creates directory recursively", async () => {
      await storage.mkdir("a/b/c");
      expect(await storage.exists("a/b/c")).toBe(true);
    });

    it("is idempotent", async () => {
      await storage.mkdir("dir");
      await storage.mkdir("dir");
      expect(await storage.exists("dir")).toBe(true);
    });
  });

  describe("isDirectory", () => {
    it("returns true for directory", async () => {
      await storage.mkdir("dir");
      expect(await storage.isDirectory("dir")).toBe(true);
    });

    it("returns false for file", async () => {
      await storage.write("file.txt", "x");
      expect(await storage.isDirectory("file.txt")).toBe(false);
    });

    it("returns false for non-existent path", async () => {
      expect(await storage.isDirectory("nope")).toBe(false);
    });
  });
});
