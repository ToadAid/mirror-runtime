# Mirror Runtime Standalone Boundary

This package boundary prepares Mirror Runtime to ship as a standalone Linux-first
runtime without carrying the full repository layout. It now includes a narrow
bootstrap path plus local-first operator surfaces:

- `mirror onboard`
- `mirror tui`
- `mirror web`

## Goals

- Keep the runtime payload explicit and reproducible.
- Separate runtime artifacts from source, tests, apps, and docs.
- Preserve current runtime behavior.
- Make the later installer a straightforward extraction + bootstrap step.

## Runtime Payload

Phase A packages the files needed to launch the built runtime entrypoints on a
clean Linux machine:

- `bin/mirror`
- `mirror.mjs`
- `dist/mirror-entry.js`
- `dist/mirror-package.js`
- `dist/schema.sql`
- `node_modules/` runtime dependency closure
- generated runtime metadata (`package.json`, `manifest.json`)
- Linux user-service and environment templates
- `install-mirror-runtime.sh` bootstrap installer

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
  install-mirror-runtime.sh
  manifest.json
  rootfs/
    opt/mirror-runtime/
      bin/
        mirror
      mirror.mjs
      package.json
      node_modules/
      dist/
        mirror-entry.js
        mirror-package.js
        schema.sql
      share/
        examples/
          mirror-runtime.env.example
        docs/
          STANDALONE_BOUNDARY.md
        lore/
          SYMBOL_REGISTRY.md
    usr/
      lib/systemd/user/
        mirror-runtime.service
```

This shape is installer-friendly because:

- `/opt/mirror-runtime` is a stable runtime root.
- the user service is separable from the runtime payload.
- config/data/state stay outside the package tree.

## Directory Conventions

Use a visible local workspace rooted at `~/.mirror/workspace`:

- env file: `~/.config/mirror-runtime/mirror-runtime.env`
- workspace root: `~/.mirror/workspace/`
- users: `~/.mirror/workspace/users/`
- lore corpus: `~/.mirror/workspace/lore/`
- state: `~/.mirror/state/`
- memory db: `~/.mirror/state/mirror-memory.db`
- logs: `~/.mirror/logs/`
- logs: journald via `systemd --user` by default

The runtime still honors explicit env overrides such as `MIRROR_LORE_DIR` and
`MIRROR_MEMORY_DB_PATH`.

## Service Boundary

The packaged service uses:

- an installed runtime root such as `/opt/mirror-runtime/bin/mirror serve`
- env from `~/.config/mirror-runtime/mirror-runtime.env`
- journald/stdout for logs

The bootstrap installer renders the service file with concrete paths for:

- runtime root
- env file
- working directory

## Install / Bootstrap

Phase B is a narrow Linux-first bootstrap flow. After extracting the packaged
artifact, run:

```bash
cd mirror-runtime-linux
./install-mirror-runtime.sh
```

Default install targets:

- runtime root: `/opt/mirror-runtime`
- config dir: `~/.config/mirror-runtime`
- workspace dir: `~/.mirror/workspace`
- state dir: `~/.mirror/state`
- logs dir: `~/.mirror/logs`
- structured settings dir: `~/.mirror/config`
- user unit dir: `~/.config/systemd/user`

The bootstrap installer:

- copies the packaged runtime into the chosen runtime root
- creates the visible workspace + state/log directories
- creates `~/.config/mirror-runtime/mirror-runtime.env` if missing
- renders `mirror-runtime.service` into the user unit dir
- optionally runs `systemctl --user daemon-reload`, `enable`, and `start`

The bootstrap env file is now only for bootstrap/runtime overrides such as
workspace/state/log paths, memory DB location, and optional port overrides.
User-facing runtime, provider, and connector settings live under
`~/.mirror/config/`.

Useful installer options:

```bash
./install-mirror-runtime.sh \
  --runtime-root /opt/mirror-runtime \
  --port 7777 \
  --enable \
  --start
```

If you want to stage the install without touching systemd yet:

```bash
./install-mirror-runtime.sh --skip-systemctl
```

## Operator Commands

After bootstrap:

```bash
/opt/mirror-runtime/bin/mirror help
systemctl --user daemon-reload
systemctl --user enable mirror-runtime.service
systemctl --user start mirror-runtime.service
systemctl --user status mirror-runtime.service
journalctl --user -u mirror-runtime -f
```

The generated env file includes safe defaults for paths and optional override
placeholders. Run `mirror onboard` after install so Mirror writes
`~/.mirror/config/mirror.json`, `providers.json`, `connectors.json`, and
`credentials.json` before you start the runtime against a real model backend.

## Local Operator Surfaces

After install or bootstrap:

```bash
mirror onboard
mirror tui
mirror web
```

- `mirror onboard` writes the local env, initializes `~/.mirror/workspace`, and
  writes the structured config under `~/.mirror/config/` plus bootstrap env
  overrides under `~/.config/mirror-runtime/mirror-runtime.env`.
- `mirror tui` opens a local terminal UI against the running Mirror runtime.
- `mirror web` opens or prints the local browser route:
  `http://127.0.0.1:<port>/mirror/ui/app`

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
pnpm verify:mirror-runtime-bootstrap
```

`verify:mirror-runtime-bootstrap` extracts the packaged artifact, runs the
bootstrap installer into a temp root, and verifies that the installed runtime,
env file, and user service unit are coherent.
