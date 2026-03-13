#!/usr/bin/env node

import module from "node:module";

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
    await import(specifier);
    return true;
  } catch (err) {
    if (isModuleNotFoundError(err)) {
      return false;
    }
    throw err;
  }
};

if (await tryImport("./dist/mirror-entry.js")) {
  // OK
} else if (await tryImport("./dist/mirror-entry.mjs")) {
  // OK
} else {
  throw new Error("mirror: missing dist/mirror-entry.(m)js (build output).");
}
