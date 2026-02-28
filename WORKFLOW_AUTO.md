# Workflow Auto-Run Protocol

## Entry Point

When this file exists, auto-execute:

```bash
cd ~/mirror-runtime && \
pwd && \
git remote -v && \
git rev-parse --show-toplevel && \
git log --oneline -n 5 && \
echo "--- WORKFLOW_CHECK: OK ---"
```

## Failure Mode

If `origin` != `https://github.com/ToadAid/mirror-runtime.git`:

1. Stop and fix
2. `git remote set-url origin https://github.com/ToadAid/mirror-runtime.git`
3. `git remote -v` to confirm
4. `git fetch origin`
5. Re-run all commands

## Success Mode

If all checks pass:

- Log result in `memory/YYYY-MM-DD.md`
- Return "WORKFLOW_CHECK: OK"

## Usage

- Read this file on session init
- Auto-execute if present
- Never auto-execute if `origin` is wrong
