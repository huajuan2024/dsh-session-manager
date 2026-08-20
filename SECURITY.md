# Security

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ Active          |

## Reporting a vulnerability

This plugin reads and deletes files inside the DSH session archive
(`~/.dsh/sessions` by default). If you find a way to make it read or delete
files outside that root — for example by crafting a `sessionId` that escapes
the directory — please **do not** open a public issue.

Report privately by emailing **huajuan2024** at the address used for the
GitHub account owning this repo. Include:

- A minimal reproduction (commands or RPC calls).
- The plugin version and the DSH profile version you observed it on.
- Any workarounds you found.

You should get an acknowledgement within a few days. A fix lands before
public disclosure is coordinated with you.

## Scope notes

- The plugin never makes network requests of its own.
- The plugin never injects content into model prompts — it does not add
  session events and does not touch `ctx.sessionQuery` for write paths.
- Export payloads contain only the decoded session content; they do not
  contain tokens, paths, or environment variables.
