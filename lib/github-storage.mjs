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
  getUrl(path) {
    if (path.split('/').includes('..')) throw new Error('Invalid path: traversal not allowed');
    return this.basePath ? `${this.baseUrl}/${this.basePath}/${path}` : `${this.baseUrl}/${path}`;
  }

  /**
   * @private
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<Record<string, unknown> | null>}
   */
  async fetchOrNull(url, options) {
    const res = await fetch(url, { ...options, headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return /** @type {Record<string, unknown>} */ (await res.json());
  }

  /** @private @param {string} path @returns {Promise<string | null>} */
  async getSha(path) {
    const data = await this.fetchOrNull(this.getUrl(path), { method: 'GET' });
    if (!data) return null;
    return /** @type {string | null} */ (data.sha || null);
  }

  /** @param {string} path @returns {Promise<string | null>} */
  async read(path) {
    const data = await this.fetchOrNull(this.getUrl(path), { method: 'GET' });
    if (!data) return null;
    return Buffer.from(/** @type {string} */ (data.content), 'base64').toString('utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async write(path, content) {
    const sha = await this.getSha(path);
    /** @type {Record<string, unknown>} */
    const body = { message: `update ${path}`, content: Buffer.from(content).toString('base64') };
    if (sha) body.sha = sha;
    const res = await fetch(this.getUrl(path), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
    if (res.status === 409) {
      const freshSha = await this.getSha(path);
      if (freshSha) body.sha = freshSha;
      const retry = await fetch(this.getUrl(path), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
      if (!retry.ok) throw new Error(`GitHub API error: ${retry.status}`);
    } else if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async append(path, content) {
    const existing = await this.read(path);
    await this.write(path, existing ? existing + content : content);
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async exists(path) {
    const data = await this.fetchOrNull(this.getUrl(path), { method: 'GET' });
    return data !== null;
  }

  /** @param {string} dir @returns {Promise<string[]>} */
  async list(dir) {
    const data = await this.fetchOrNull(this.getUrl(dir), { method: 'GET' });
    if (!data || !Array.isArray(data)) return [];
    return data.map((/** @type {{ name: string }} */ entry) => entry.name);
  }

  /** @param {string} _dir @returns {Promise<void>} */
  async mkdir(_dir) { /* GitHub creates directories implicitly */ }

  /** @param {string} path @returns {Promise<boolean>} */
  async isDirectory(path) {
    const data = await this.fetchOrNull(this.getUrl(path), { method: 'GET' });
    if (!data) return false;
    return Array.isArray(data);
  }

  /** @param {number} unflushedBytes @returns {boolean} */
  shouldFlush(unflushedBytes) {
    return unflushedBytes >= 10 * 1024;
  }
}
