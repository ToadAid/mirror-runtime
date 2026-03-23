# Mirror Runtime Standalone Boundary

This package boundary prepares Mirror Runtime to ship as a standalone Linux-first
runtime without carrying the full repository layout, and now includes a narrow
bootstrap path for installing and wiring the packaged runtime on a clean host.

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

The generated distribution tree inside `mirror-runtime-linux.tar.gz` is:

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
- data dir: `~/.local/share/mirror-runtime`
- state dir: `~/.local/state/mirror-runtime`
- user unit dir: `~/.config/systemd/user`

The bootstrap installer:

- copies the packaged runtime into the chosen runtime root
- creates the XDG config/data/state directories
- creates `~/.config/mirror-runtime/mirror-runtime.env` if missing
- renders `mirror-runtime.service` into the user unit dir
- optionally runs `systemctl --user daemon-reload`, `enable`, and `start`

Useful installer options:

```bash
./install-mirror-runtime.sh \
  --runtime-root /opt/mirror-runtime \
  --provider-url https://provider.example/v1/chat/completions \
  --provider-token replace-me \
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

The generated env file includes safe defaults for paths, port, and node id. You
must still provide real provider settings before starting the runtime against a
real model backend.

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
