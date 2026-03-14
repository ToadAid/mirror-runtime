# Mirror Runtime Canonical Entrypoints

Last updated: March 13, 2026

## Canonical Mirror-native entrypoints

Use these as the primary Mirror runtime surfaces:

### CLI

- [mirror.mjs](/home/tommy/mirror-runtime/mirror.mjs)
- [src/mirror-entry.ts](/home/tommy/mirror-runtime/src/mirror-entry.ts)
- [src/mirror-cli/mirror_cli.ts](/home/tommy/mirror-runtime/src/mirror-cli/mirror_cli.ts)

### Service

- [src/mirror-service/mirror_service.ts](/home/tommy/mirror-runtime/src/mirror-service/mirror_service.ts)
- [src/mirror-service/runtime_host.ts](/home/tommy/mirror-runtime/src/mirror-service/runtime_host.ts)

### Runtime core

- [src/mirrordaemon/mirrordaemon.ts](/home/tommy/mirror-runtime/src/mirrordaemon/mirrordaemon.ts)
- [src/mirror-runtime/mirror_chat_engine.ts](/home/tommy/mirror-runtime/src/mirror-runtime/mirror_chat_engine.ts)
- [src/mirror-provider/mirror_provider.ts](/home/tommy/mirror-runtime/src/mirror-provider/mirror_provider.ts)
- [src/mirror-gateway/routes.ts](/home/tommy/mirror-runtime/src/mirror-gateway/routes.ts)

### Root package boundary

- [package.json](/home/tommy/mirror-runtime/package.json)
  - root package identity is now `mirror-runtime`
- [src/mirror-package.ts](/home/tommy/mirror-runtime/src/mirror-package.ts)
  - canonical root export surface

## Compatibility decision

OpenClaw compatibility remains temporarily supported, but only as a compatibility boundary.

Compatibility code lives under:

- [src/compat/openclaw](/home/tommy/mirror-runtime/src/compat/openclaw)
- [package.json](/home/tommy/mirror-runtime/packages/openclaw/package.json)

Compatibility wrapper paths still exist at:

- [src/runtime/server.ts](/home/tommy/mirror-runtime/src/runtime/server.ts)
- [src/runtime/brain-chat.ts](/home/tommy/mirror-runtime/src/runtime/brain-chat.ts)
- [src/runtime/health.ts](/home/tommy/mirror-runtime/src/runtime/health.ts)
- [src/cli/mirror-cli.ts](/home/tommy/mirror-runtime/src/cli/mirror-cli.ts)

These are not canonical runtime entrypoints anymore.

## Practical rule

If building or integrating Mirror Runtime directly:

- use `mirror`
- use the Mirror-native service routes
- use the Mirror-native package boundary

If supporting legacy OpenClaw callers:

- use the explicit compatibility package and wrappers only
