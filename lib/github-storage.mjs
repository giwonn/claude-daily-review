// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

/** @implements {StorageAdapter} */
export class GitHubStorageAdapter {
  /** @param {string} owner @param {string} repo @param {string} token @param {string} basePath */
  constructor(owner, repo, token, basePath) {
    /** @private */ this.baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    /** @private */ this.basePath = basePath;
    /** @private */ this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /** @private @param {string} path @returns {string} */
  getUrl(path) { return this.basePath ? `${this.baseUrl}/${this.basePath}/${path}` : `${this.baseUrl}/${path}`; }

  /** @private @param {string} path @returns {Promise<string | null>} */
  async getSha(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    if (res.status === 404) return null;
    const data = /** @type {Record<string, unknown>} */ (await res.json());
    return /** @type {string | null} */ (data.sha || null);
  }

  /** @param {string} path @returns {Promise<string | null>} */
  async read(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    if (res.status === 404) return null;
    const data = /** @type {Record<string, unknown>} */ (await res.json());
    return Buffer.from(/** @type {string} */ (data.content), 'base64').toString('utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async write(path, content) {
    const sha = await this.getSha(path);
    /** @type {Record<string, unknown>} */
    const body = { message: `update ${path}`, content: Buffer.from(content).toString('base64') };
    if (sha) body.sha = sha;
    const res = await fetch(this.getUrl(path), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
    if (!res.ok && res.status === 409) {
      const freshSha = await this.getSha(path);
      if (freshSha) body.sha = freshSha;
      await fetch(this.getUrl(path), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
    }
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async append(path, content) {
    const existing = await this.read(path);
    await this.write(path, existing ? existing + content : content);
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async exists(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    return res.status !== 404;
  }

  /** @param {string} dir @returns {Promise<string[]>} */
  async list(dir) {
    const res = await fetch(this.getUrl(dir), { method: 'GET', headers: this.headers });
    if (res.status === 404) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((/** @type {{ name: string }} */ entry) => entry.name);
  }

  /** @param {string} _dir @returns {Promise<void>} */
  async mkdir(_dir) { /* GitHub creates directories implicitly */ }

  /** @param {string} path @returns {Promise<boolean>} */
  async isDirectory(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    if (res.status === 404) return false;
    const data = await res.json();
    return Array.isArray(data);
  }
}
