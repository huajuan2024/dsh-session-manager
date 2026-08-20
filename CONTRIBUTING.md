# Contributing to dsh-session-manager

Thanks for your interest in this plugin. This is a small, focused tool — the
bar for additions is "does it help a real user manage their sessions
without adding risk".

## Development setup

```bash
pnpm install
pnpm run typecheck     # tsc --noEmit
pnpm run build         # tsc host + client bundles into lib/
pnpm run test          # node --test test/*.test.mjs
```

Requirements: Node.js ≥ 22.19 (matches `engines` in `package.json`).

## Pull requests

- Keep PRs scoped. One change per PR is easier to review than a sweeping refactor.
- If your change touches the public Remote API surface (`list`, `readHistory`,
  `delete`, `export`) or the Host-to-Client DTO in `src/types.ts`, call it out
  in the PR description — these are the contract between Host and Client and
  need a deliberate bump of the minor version.
- Add a test for any new behavior in `test/` using `node --test`.
- Run `pnpm run typecheck && pnpm run test` locally before opening the PR.

## Coding style

- TypeScript with `strict` (already on in `tsconfig.json`).
- No new runtime dependencies unless they earn their place. The current
  peer-dep footprint is intentionally small.
- `lib/` is generated — never edit it directly. Bump the relevant `tsconfig`
  and rerun `pnpm run build`.

## Security

If you discover a vulnerability — for example a path-traversal in the
session delete or export flow — please **do not** open a public issue.
See [SECURITY.md](./SECURITY.md).
