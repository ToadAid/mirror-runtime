import fs from "node:fs/promises";
import path from "node:path";

export type MirrorSessionStore = {
  rootDir: string;
  resolvePath: (...segments: string[]) => string;
  readJsonFile: <T>(fileName: string, fallback: T) => Promise<T>;
  writeJsonFile: (fileName: string, payload: unknown) => Promise<string>;
};

export type FileMirrorSessionStoreOptions = {
  rootDir?: string;
};

export class FileMirrorSessionStore implements MirrorSessionStore {
  readonly rootDir: string;

  constructor(options?: FileMirrorSessionStoreOptions) {
    this.rootDir = path.resolve(options?.rootDir ?? path.resolve(process.cwd(), ".mirror"));
  }

  resolvePath(...segments: string[]): string {
    return path.resolve(this.rootDir, ...segments);
  }

  async readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
    const filePath = this.resolvePath(fileName);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return fallback;
      }
      throw error;
    }
  }

  async writeJsonFile(fileName: string, payload: unknown): Promise<string> {
    const filePath = this.resolvePath(fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    return filePath;
  }
}
