import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubStorageAdapter } from "../../src/core/github-storage.js";

describe("GitHubStorageAdapter", () => {
  let storage: GitHubStorageAdapter;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    storage = new GitHubStorageAdapter("testowner", "testrepo", "tok_123", "daily-review");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("read", () => {
    it("returns decoded content for existing file", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("hello world").toString("base64"),
          sha: "abc123",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

      const result = await storage.read("test.txt");
      expect(result).toBe("hello world");
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "https://api.github.com/repos/testowner/testrepo/contents/daily-review/test.txt",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("returns null for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      const result = await storage.read("nope.txt");
      expect(result).toBeNull();
    });
  });

  describe("write", () => {
    it("creates new file without SHA", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "new123" } }), { status: 201 }),
      );

      await storage.write("new.txt", "content");

      const putCall = vi.mocked(fetch).mock.calls[1];
      expect(putCall[0]).toContain("daily-review/new.txt");
      const body = JSON.parse(putCall[1]!.body as string);
      expect(body.content).toBe(Buffer.from("content").toString("base64"));
      expect(body.sha).toBeUndefined();
    });

    it("updates existing file with SHA", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("old").toString("base64"),
          sha: "old123",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "new123" } }), { status: 200 }),
      );

      await storage.write("existing.txt", "new content");

      const putCall = vi.mocked(fetch).mock.calls[1];
      const body = JSON.parse(putCall[1]!.body as string);
      expect(body.sha).toBe("old123");
    });
  });

  describe("append", () => {
    it("creates file if not exists", async () => {
      // read returns null (404)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      // write: getSha 404 + PUT 201
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "new123" } }), { status: 201 }),
      );

      await storage.append("log.txt", "line1\n");
      // Verify PUT was called
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    });

    it("appends to existing file", async () => {
      // read returns existing content
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("line1\n").toString("base64"),
          sha: "sha1",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      // write: getSha returns sha + PUT update
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("line1\n").toString("base64"),
          sha: "sha1",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "sha2" } }), { status: 200 }),
      );

      await storage.append("log.txt", "line2\n");

      // Verify the PUT body contains appended content
      const putCall = vi.mocked(fetch).mock.calls[2];
      const body = JSON.parse(putCall[1]!.body as string);
      const decoded = Buffer.from(body.content, "base64").toString("utf-8");
      expect(decoded).toBe("line1\nline2\n");
    });
  });

  describe("exists", () => {
    it("returns true for 200", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ sha: "abc" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns false for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      expect(await storage.exists("nope.txt")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns file names from directory listing", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([
          { name: "a.txt", type: "file" },
          { name: "b.md", type: "file" },
          { name: "subdir", type: "dir" },
        ]), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

      const result = await storage.list("mydir");
      expect(result).toEqual(["a.txt", "b.md", "subdir"]);
    });

    it("returns empty array for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      expect(await storage.list("nope")).toEqual([]);
    });
  });

  describe("mkdir", () => {
    it("is a no-op", async () => {
      await storage.mkdir("some/dir");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("isDirectory", () => {
    it("returns true when API returns array", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([{ name: "file.txt" }]), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      expect(await storage.isDirectory("mydir")).toBe(true);
    });

    it("returns false when API returns object (file)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ type: "file", sha: "abc" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      expect(await storage.isDirectory("file.txt")).toBe(false);
    });

    it("returns false for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      expect(await storage.isDirectory("nope")).toBe(false);
    });
  });
});
