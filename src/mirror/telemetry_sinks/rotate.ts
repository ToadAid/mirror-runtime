import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";

function isFileAtOrAboveThreshold(filePath: string, rotateBytes: number): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  const stat = statSync(filePath);
  return stat.isFile() && stat.size >= rotateBytes;
}

export function rotateIfNeeded(filePath: string, rotateBytes: number, keep: number): void {
  if (rotateBytes <= 0 || keep <= 0) {
    return;
  }
  if (!isFileAtOrAboveThreshold(filePath, rotateBytes)) {
    return;
  }

  const prunePath = `${filePath}.${keep + 1}`;
  if (existsSync(prunePath)) {
    unlinkSync(prunePath);
  }

  for (let index = keep; index >= 1; index -= 1) {
    const src = `${filePath}.${index}`;
    const dst = `${filePath}.${index + 1}`;
    if (existsSync(src)) {
      renameSync(src, dst);
    }
  }

  renameSync(filePath, `${filePath}.1`);
}
