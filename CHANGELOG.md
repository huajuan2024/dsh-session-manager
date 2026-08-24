# Changelog

All notable changes to `dsh-session-manager` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2025-08-24

### Changed
- `readHistory`, `delete`, and `export` now accept both legacy `session-<uuid>`
  ids and the bare UUIDs that newer DSH subagent sessions use.
- `SESSION_ID_PATTERN` is anchored at start and end, so values like
  `../<uuid>` or `<uuid>/child` continue to be rejected.

## [0.1.4] - 2025-08-20

### Added
- Initial public release.
- `ctx.sessionManager` Cordis service on the Host with 4 Remote APIs:
  `list`, `readHistory`, `delete`, `export`.
- Web client panel under **Settings → Plugins** that lists sessions, shows
  message history (capped at `previewMessageLimit`), deletes non-running
  sessions, and exports a session as JSON or Markdown via a browser Blob URL.
- Configurable limits: `sessionsRoot`, `maxExportBytes` (default 10 MiB),
  `previewMessageLimit` (default 200).

### Security
- Host-side file access stays inside the DSH process; session file absolute
  paths and access tokens are never returned through Remote APIs.
- Running sessions are refused for deletion.
- `sessionId` must match `session-<uuid>` before any read or delete call
  touches the filesystem.
