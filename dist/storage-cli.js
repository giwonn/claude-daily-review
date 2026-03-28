var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/github-storage.ts
var github_storage_exports = {};
__export(github_storage_exports, {
  GitHubStorageAdapter: () => GitHubStorageAdapter
});
var GitHubStorageAdapter;
var init_github_storage = __esm({
  "src/core/github-storage.ts"() {
    "use strict";
    GitHubStorageAdapter = class {
      constructor(owner, repo, token, basePath) {
        this.owner = owner;
        this.repo = repo;
        this.token = token;
        this.basePath = basePath;
        this.baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
        this.headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        };
      }
      baseUrl;
      headers;
      getUrl(path) {
        return `${this.baseUrl}/${this.basePath}/${path}`;
      }
      async getSha(path) {
        const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
        if (res.status === 404) return null;
        const data = await res.json();
        return data.sha || null;
      }
      async read(path) {
        const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
        if (res.status === 404) return null;
        const data = await res.json();
        const content = data.content;
        return Buffer.from(content, "base64").toString("utf-8");
      }
      async write(path, content) {
        const sha = await this.getSha(path);
        const body = {
          message: `update ${path}`,
          content: Buffer.from(content).toString("base64")
        };
        if (sha) body.sha = sha;
        const res = await fetch(this.getUrl(path), {
          method: "PUT",
          headers: this.headers,
          body: JSON.stringify(body)
        });
        if (!res.ok && res.status === 409) {
          const freshSha = await this.getSha(path);
          if (freshSha) body.sha = freshSha;
          await fetch(this.getUrl(path), {
            method: "PUT",
            headers: this.headers,
            body: JSON.stringify(body)
          });
        }
      }
      async append(path, content) {
        const existing = await this.read(path);
        const newContent = existing ? existing + content : content;
        await this.write(path, newContent);
      }
      async exists(path) {
        const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
        return res.status !== 404;
      }
      async list(dir) {
        const res = await fetch(this.getUrl(dir), { method: "GET", headers: this.headers });
        if (res.status === 404) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((entry) => entry.name);
      }
      async mkdir(_dir) {
      }
      async isDirectory(path) {
        const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
        if (res.status === 404) return false;
        const data = await res.json();
        return Array.isArray(data);
      }
    };
  }
});

// src/core/config.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
import { dirname as dirname2, join as join2 } from "path";

// src/core/local-storage.ts
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync
} from "fs";
import { dirname, join } from "path";
var LocalStorageAdapter = class {
  constructor(basePath) {
    this.basePath = basePath;
  }
  resolve(path) {
    return join(this.basePath, path);
  }
  async read(path) {
    const full = this.resolve(path);
    if (!existsSync(full)) return null;
    return readFileSync(full, "utf-8");
  }
  async write(path, content) {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
  async append(path, content) {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, "utf-8");
  }
  async exists(path) {
    return existsSync(this.resolve(path));
  }
  async list(dir) {
    const full = this.resolve(dir);
    if (!existsSync(full)) return [];
    return readdirSync(full);
  }
  async mkdir(dir) {
    mkdirSync(this.resolve(dir), { recursive: true });
  }
  async isDirectory(path) {
    try {
      return statSync(this.resolve(path)).isDirectory();
    } catch {
      return false;
    }
  }
};

// src/core/config.ts
function getConfigPath() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    throw new Error("CLAUDE_PLUGIN_DATA environment variable is not set");
  }
  return join2(dataDir, "config.json");
}
function isOldConfig(raw) {
  if (!raw || typeof raw !== "object") return false;
  return "vaultPath" in raw && "reviewFolder" in raw;
}
function migrateOldConfig(old) {
  return {
    storage: {
      type: "local",
      local: {
        basePath: join2(old.vaultPath, old.reviewFolder)
      }
    },
    language: old.language,
    periods: old.periods,
    profile: old.profile
  };
}
function loadConfig() {
  const configPath = getConfigPath();
  if (!existsSync2(configPath)) return null;
  const raw = JSON.parse(readFileSync2(configPath, "utf-8"));
  if (isOldConfig(raw)) {
    const migrated = migrateOldConfig(raw);
    saveConfig(migrated);
    return migrated;
  }
  return raw;
}
function saveConfig(config) {
  const configPath = getConfigPath();
  mkdirSync2(dirname2(configPath), { recursive: true });
  writeFileSync2(configPath, JSON.stringify(config, null, 2), "utf-8");
}
async function createStorageAdapter(config) {
  if (config.storage.type === "local") {
    return new LocalStorageAdapter(config.storage.local.basePath);
  }
  if (config.storage.type === "github") {
    const { GitHubStorageAdapter: GitHubStorageAdapter2 } = await Promise.resolve().then(() => (init_github_storage(), github_storage_exports));
    const g = config.storage.github;
    return new GitHubStorageAdapter2(g.owner, g.repo, g.token, g.basePath);
  }
  throw new Error(`Unknown storage type: ${config.storage.type}`);
}

// src/cli/storage-cli.ts
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = loadConfig();
  if (!config) {
    process.stderr.write("config not found\n");
    process.exit(1);
  }
  const storage = await createStorageAdapter(config);
  switch (command) {
    case "read": {
      const content = await storage.read(args[0]);
      if (content !== null) process.stdout.write(content);
      break;
    }
    case "write": {
      let data = "";
      process.stdin.setEncoding("utf-8");
      for await (const chunk of process.stdin) {
        data += chunk;
      }
      await storage.write(args[0], data);
      break;
    }
    case "append": {
      let data = "";
      process.stdin.setEncoding("utf-8");
      for await (const chunk of process.stdin) {
        data += chunk;
      }
      await storage.append(args[0], data);
      break;
    }
    case "list": {
      const entries = await storage.list(args[0]);
      process.stdout.write(entries.join("\n") + "\n");
      break;
    }
    case "exists": {
      const exists = await storage.exists(args[0]);
      process.stdout.write(exists ? "true\n" : "false\n");
      process.exit(exists ? 0 : 1);
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${command}
Usage: storage-cli <read|write|append|list|exists> <path>
`);
      process.exit(1);
  }
}
main().catch((err) => {
  process.stderr.write(`Error: ${err.message}
`);
  process.exit(1);
});
//# sourceMappingURL=storage-cli.js.map