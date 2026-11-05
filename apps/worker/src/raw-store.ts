import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

// ponytail: local gzip files. Swap for R2 (handoff §2) once R2 keys exist; the key format stays the same.
export class RawStore {
  private readonly root: string;

  constructor(root = process.env.RAW_DIR ?? "../../data/raw") {
    this.root = resolve(root);
  }

  /** Stores a provider's raw payload; returns the key saved on Answer.rawKey. */
  async put(key: string, raw: unknown): Promise<string> {
    const path = join(this.root, `${key}.json.gz`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, gzipSync(JSON.stringify(raw)));
    return `${key}.json.gz`;
  }

  /** Reads back a payload saved by put() (for re-parsing old answers). */
  async get(key: string): Promise<unknown> {
    return JSON.parse(gunzipSync(await readFile(join(this.root, key))).toString("utf8"));
  }
}
