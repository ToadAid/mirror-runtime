#!/usr/bin/env node

import module from "node:module";
import process from "node:process";

if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors.
  }
}

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const tryImport = async (specifier) => {
  try {
    return await import(specifier);
  } catch (err) {
    if (isModuleNotFoundError(err)) {
      return undefined;
    }
    throw err;
  }
};

const mod =
  (await tryImport("./dist/mirror-entry.js")) ?? (await tryImport("./dist/mirror-entry.mjs"));

if (!mod) {
  throw new Error("mirror: missing dist/mirror-entry.(m)js (build output).");
}

if (typeof mod.runMirrorEntry !== "function") {
  throw new Error("mirror: dist/mirror-entry does not export runMirrorEntry().");
}

const exitCode = await mod.runMirrorEntry(process.argv);
if (typeof exitCode === "number") {
  process.exitCode = exitCode;
}
