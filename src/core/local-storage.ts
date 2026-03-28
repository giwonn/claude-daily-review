import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { dirname, join } from "path";
import type { StorageAdapter } from "./storage.js";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {}

  private resolve(path: string): string {
    return join(this.basePath, path);
  }

  async read(path: string): Promise<string | null> {
    const full = this.resolve(path);
    if (!existsSync(full)) return null;
    return readFileSync(full, "utf-8");
  }

  async write(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }

  async append(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, "utf-8");
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(this.resolve(path));
  }

  async list(dir: string): Promise<string[]> {
    const full = this.resolve(dir);
    if (!existsSync(full)) return [];
    return readdirSync(full);
  }

  async mkdir(dir: string): Promise<void> {
    mkdirSync(this.resolve(dir), { recursive: true });
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      return statSync(this.resolve(path)).isDirectory();
    } catch {
      return false;
    }
  }
}
