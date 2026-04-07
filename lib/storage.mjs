// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve as pathResolve } from 'path';

/** @implements {StorageAdapter} */
export class LocalStorageAdapter {
  /** @param {string} basePath */
  constructor(basePath) {
    /** @private */
    this.basePath = basePath;
  }

  /** @private @param {string} path @returns {string} */
  resolve(path) {
    const full = pathResolve(this.basePath, path);
    if (full !== this.basePath && !full.startsWith(this.basePath + '/')) {
      throw new Error('Invalid path: traversal outside base directory');
    }
    return full;
  }

  /** @param {string} path @returns {Promise<string | null>} */
  async read(path) {
    const full = this.resolve(path);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async write(path, content) {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async append(path, content) {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, 'utf-8');
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async exists(path) {
    return existsSync(this.resolve(path));
  }

  /** @param {string} dir @returns {Promise<string[]>} */
  async list(dir) {
    const full = this.resolve(dir);
    if (!existsSync(full)) return [];
    return readdirSync(full);
  }

  /** @param {string} dir @returns {Promise<void>} */
  async mkdir(dir) {
    mkdirSync(this.resolve(dir), { recursive: true });
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async isDirectory(path) {
    try { return statSync(this.resolve(path)).isDirectory(); }
    catch { return false; }
  }

  /** @param {number} unflushedBytes @returns {boolean} */
  shouldFlush(unflushedBytes) {
    return unflushedBytes > 0;
  }
}
