# dsh-session-manager

[![CI](https://github.com/huajuan2024/dsh-session-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/huajuan2024/dsh-session-manager/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/p/huajuan2024/dsh-session-manager)

DeepSeek Harness (DSH) 插件:在 Web UI 的「设置 → 插件」里提供一个会话管理面板,
支持**查看历史消息、删除会话、导出单条会话**(JSON 或 Markdown)。

## 架构

- `src/index.ts`:Cordis Host 服务 `ctx.sessionManager`,通过 rc.7 正式
  `ctx.sessionQuery` 服务读取会话,负责删除、格式转换,以及 4 个 Remote API
  (list / readHistory / delete / export)。
- `src/client.ts`:Web 客户端插件,通过标准 `/api` RPC 调用 Host,注册
  `settings.plugins.tab` slot,在「设置 → 插件」里渲染会话列表与详情面板。
- `src/types.ts`:Host 对浏览器公开的白名单 DTO。
- `lib/`:由 TypeScript 生成的发布产物,不要手工修改。

## 安全模型

- 本插件**不向模型请求注入内容**,因此不会新增 session event。
- 文件操作只发生在 Host 进程,token 或文件绝对路径不会进入 Remote 返回值。
- `sessionId` 必须是裸 UUID 或匹配 `session-<uuid>`,分别兼容新版子代理会话和
  传统根会话；其它格式会被拒绝，避免路径穿越。
- 正在运行的会话(`running` 状态)不可删除,需要先结束会话。

## 功能

- 列出所有已知会话(含 title / cwd / updatedAt / turns / steps / agentPreset)。
- 点击单个会话查看其消息历史。
- 删除单条会话(运行中的会话会被拒绝;删除不可恢复)。
- 导出单条会话为 JSON 或 Markdown,走浏览器 Blob URL 触发下载。

## 前置要求

- Node.js 22.19 或更高版本
- DeepSeek Harness `0.1.0-rc.7` 兼容版本

## 构建

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test
```

## 安装

从插件目录生成 tarball:

```bash
pnpm pack
dsh plugin --profile web add ../../plugin-releases/dsh-session-manager-0.1.5.tgz
```

## Profile 配置

通过 `dsh plugin --profile web add` 安装 bundle 后,包内 `cordis.patch.yml` 提供默认
配置。需要覆盖时,在 `~/.dsh/profiles/web/cordis.patch.yml` 中使用同一个 id:

```yaml
- insert:
    - id: sessionManager
      name: dsh-session-manager
      config:
        sessionsRoot: ~/.dsh/sessions
        maxExportBytes: 10485760
        previewMessageLimit: 200
```

如果文件当前内容只有 `[]`,必须用上面的列表替换 `[]`,不能把列表追加在 `[]` 后面。
Harness 的后置 patch 会按 id 替换整份 config,因此覆盖时需要写出希望保留的全部字段。

检查最终组合结果:

```bash
dsh --profile web --dump-config
```

## 配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `sessionsRoot` | `~/.dsh/sessions` | DSH 会话存档根目录 |
| `maxExportBytes` | `10485760` | 单次导出的字节上限(10 MiB),超过返回 `too-large` |
| `previewMessageLimit` | `200` | `readHistory` 单次返回的最大消息条数 |

## 验证

启动 Web profile 后检查:

1. 「设置 → 插件」tab 中出现「会话管理」面板,列出所有会话。
2. 点击行展开,显示消息历史(前 200 条)。
3. 删除按钮在 running 会话上不可点击,其它会话二次确认后可删除。
4. 导出 JSON / Markdown 触发浏览器下载,文件内容与本地 `session.jsonl.zstd`
   解码后内容一致。

## 故障排查

- `session-running`:会话正在运行中,无法删除;请先结束该会话。
- `not-found`:会话目录已不存在,可能已被其他进程清理。
- `invalid-session-id`:sessionId 既不是裸 UUID,也不符合 `session-<uuid>`,请求被拒绝。
- `permission-denied`:Host 进程没有删除或读取该目录的权限。
- `upstream-error`:zstd 解压或 JSONL 解析失败,文件可能损坏。
- `too-large`:会话存档超过 `maxExportBytes`,已拒绝导出。
