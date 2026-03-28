import type { StorageAdapter } from "./storage.js";

export class GitHubStorageAdapter implements StorageAdapter {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    private owner: string,
    private repo: string,
    private token: string,
    private basePath: string,
  ) {
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  private getUrl(path: string): string {
    return `${this.baseUrl}/${this.basePath}/${path}`;
  }

  private async getSha(path: string): Promise<string | null> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    if (res.status === 404) return null;
    const data = await res.json() as Record<string, unknown>;
    return (data.sha as string) || null;
  }

  async read(path: string): Promise<string | null> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    if (res.status === 404) return null;
    const data = await res.json() as Record<string, unknown>;
    const content = data.content as string;
    return Buffer.from(content, "base64").toString("utf-8");
  }

  async write(path: string, content: string): Promise<void> {
    const sha = await this.getSha(path);
    const body: Record<string, unknown> = {
      message: `update ${path}`,
      content: Buffer.from(content).toString("base64"),
    };
    if (sha) body.sha = sha;

    const res = await fetch(this.getUrl(path), {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status === 409) {
      const freshSha = await this.getSha(path);
      if (freshSha) body.sha = freshSha;
      await fetch(this.getUrl(path), {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(body),
      });
    }
  }

  async append(path: string, content: string): Promise<void> {
    const existing = await this.read(path);
    const newContent = existing ? existing + content : content;
    await this.write(path, newContent);
  }

  async exists(path: string): Promise<boolean> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    return res.status !== 404;
  }

  async list(dir: string): Promise<string[]> {
    const res = await fetch(this.getUrl(dir), { method: "GET", headers: this.headers });
    if (res.status === 404) return [];
    const data = await res.json() as Array<{ name: string }>;
    if (!Array.isArray(data)) return [];
    return data.map((entry) => entry.name);
  }

  async mkdir(_dir: string): Promise<void> {
    // GitHub creates directories implicitly when files are created
  }

  async isDirectory(path: string): Promise<boolean> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    if (res.status === 404) return false;
    const data = await res.json();
    return Array.isArray(data);
  }
}
