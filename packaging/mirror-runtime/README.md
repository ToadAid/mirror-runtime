# Mirror Runtime Standalone Boundary

This package boundary prepares Mirror Runtime to ship as a standalone Linux-first
runtime without carrying the full repository layout.

## Goals

- Keep the runtime payload explicit and reproducible.
- Separate runtime artifacts from source, tests, apps, and docs.
- Preserve current runtime behavior.
- Make the later installer a straightforward extraction + dependency/bootstrap step.

## Runtime Payload

Phase 1 packages only the files needed to launch the built runtime entrypoints:

- `bin/mirror`
- `mirror.mjs`
- `dist/mirror-entry.js`
- `dist/mirror-package.js`
- `dist/schema.sql`
- generated runtime metadata (`package.json`, `manifest.json`)
- Linux user-service and environment templates

The package boundary intentionally excludes repository-only content:

- `src/`
- `test/`
- `docs/`
- `apps/`
- development scripts
- Git metadata

## Linux-first Distribution Shape

The generated distribution tree is:

```text
dist/mirror-runtime-linux/
  manifest.json
  rootfs/
    opt/mirror-runtime/
      bin/
        mirror
      mirror.mjs
      package.json
      dist/
        mirror-entry.js
        mirror-package.js
        schema.sql
      share/
        examples/
          mirror-runtime.env.example
        docs/
          STANDALONE_BOUNDARY.md
    usr/
      lib/systemd/user/
        mirror-runtime.service
```

This shape is installer-friendly because:

- `/opt/mirror-runtime` is a stable runtime root.
- the user service is separable from the runtime payload.
- config/data/state stay outside the package tree.

## Directory Conventions

Use XDG-style user directories:

- config: `~/.config/mirror-runtime/`
- env file: `~/.config/mirror-runtime/mirror-runtime.env`
- data: `~/.local/share/mirror-runtime/`
- lore corpus: `~/.local/share/mirror-runtime/lore-scrolls/`
- state: `~/.local/state/mirror-runtime/`
- memory db: `~/.local/state/mirror-runtime/mirror-memory.db`
- logs: journald via `systemd --user` by default

The runtime still honors explicit env overrides such as `MIRROR_LORE_DIR` and
`MIRROR_MEMORY_DB_PATH`.

## Service Boundary

The packaged service uses:

- `/opt/mirror-runtime/bin/mirror serve`
- env from `~/.config/mirror-runtime/mirror-runtime.env`
- journald/stdout for logs

## Post-build Verification

After `pnpm build:mirror`, run:

```bash
node --import tsx scripts/assemble-mirror-runtime-dist.ts
node --import tsx scripts/verify-mirror-runtime-dist.ts
```

Or use:

```bash
pnpm package:mirror-runtime
pnpm verify:mirror-runtime-dist
```
