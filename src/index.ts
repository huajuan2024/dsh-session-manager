import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { type Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type {
  SessionExportFormat,
  SessionManagerConfig,
  SessionManagerErrorCode,
  SessionManagerExportResult,
  SessionManagerHistoryEvent,
  SessionManagerHistoryPage,
  SessionManagerSessionSummary,
} from './types.js'

const SESSION_ID_PATTERN = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_HISTORY_PAGE_SIZE = 200
const SUMMARY_READ_CONCURRENCY = 4

function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  return value
}

/**
 * Error thrown by the Host when a request must surface a typed failure to the
 * browser. Mirrors `PublicUsageError` in the sibling minimax plugin.
 */
class PublicSessionError extends Error {
  constructor(readonly code: SessionManagerErrorCode, message: string) {
    super(message)
    this.name = 'PublicSessionError'
  }
}

function assertSessionId(value: unknown): string {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
    throw new PublicSessionError(
      'invalid-session-id',
      'sessionId must match session-<uuid>.',
    )
  }
  return value
}

interface SessionEventLike {
  seq: number
  type: string
  time: number
  data: unknown
  [key: string]: unknown
}

interface SessionHeaderLike {
  id: string
  createdAt: number
  cwd?: string
  agentPreset?: string
}

interface SessionRecordLike {
  header: SessionHeaderLike
  live: boolean
  persisted: boolean
}

interface SessionLogSnapshotLike {
  session: SessionHeaderLike
  events: SessionEventLike[]
}

interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<SessionRecordLike[]>
  readSession(sessionId: string): Promise<SessionLogSnapshotLike>
}

interface AgentsLike {
  get(sessionId: string): { status?: string } | undefined
}

export default class SessionManagerService extends TypertRemoteService {
  static inject = ['sessionQuery', 'agents'] as const

  static Config = z.object({
    sessionsRoot: z.string().default('~/.dsh/sessions'),
    maxExportBytes: z.number().step(1).min(1024).default(10 * 1024 * 1024),
    previewMessageLimit: z.number().step(1).min(1).max(2000).default(DEFAULT_HISTORY_PAGE_SIZE),
  })

  private readonly config: Required<SessionManagerConfig>
  private readonly sessionsRoot: string

  constructor(ctx: Context, config: SessionManagerConfig = {}) {
    super(ctx, 'sessionManager')
    this.config = {
      sessionsRoot: config.sessionsRoot ?? '~/.dsh/sessions',
      maxExportBytes: config.maxExportBytes ?? 10 * 1024 * 1024,
      previewMessageLimit: config.previewMessageLimit ?? DEFAULT_HISTORY_PAGE_SIZE,
    }
    this.sessionsRoot = expandHome(this.config.sessionsRoot)
  }

  /** Map a session-query failure into the plugin's browser-safe vocabulary. */
  private wrapQueryFailure(failure: unknown): PublicSessionError {
    const record = typeof failure === 'object' && failure !== null
      ? failure as { code?: unknown, message?: unknown }
      : undefined
    const upstreamCode = typeof record?.code === 'string' ? record.code : ''
    const message = typeof record?.message === 'string'
      ? record.message
      : failure instanceof Error ? failure.message : String(failure)
    const known: Record<string, SessionManagerErrorCode> = {
      SESSION_QUERY_SESSION_NOT_FOUND: 'not-found',
      SESSION_QUERY_INVALID_QUERY: 'invalid-session-id',
      EACCES: 'permission-denied',
      EPERM: 'permission-denied',
    }
    return new PublicSessionError(known[upstreamCode] ?? 'upstream-error', message)
  }

  private sessionQuery(): SessionQueryLike {
    return (this.ctx as unknown as { sessionQuery: SessionQueryLike }).sessionQuery
  }

  private agents(): AgentsLike {
    return (this.ctx as unknown as { agents: AgentsLike }).agents
  }

  private async listSessionRecords(): Promise<SessionRecordLike[]> {
    try {
      return await this.sessionQuery().listSessions()
    } catch (error) {
      throw this.wrapQueryFailure(error)
    }
  }

  private async readSession(sessionId: string): Promise<SessionLogSnapshotLike> {
    try {
      return await this.sessionQuery().readSession(sessionId)
    } catch (error) {
      throw this.wrapQueryFailure(error)
    }
  }

  private sessionDirectory(sessionId: string): string {
    // DSH stores sessions under <sessionsRoot>/<cwdEncoded>/<sessionId>/.
    // Walking the entire root lets us delete the session regardless of which
    // project directory owns it; we never accept a cwd from the client.
    return path.join(this.sessionsRoot, '_lookup_', sessionId)
  }

  private async findSessionDirectory(sessionId: string): Promise<string | undefined> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(this.sessionsRoot, { withFileTypes: true })
    } catch {
      return undefined
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(this.sessionsRoot, entry.name, sessionId)
      try {
        const stat = await fs.stat(candidate)
        if (stat.isDirectory()) return candidate
      } catch {
        continue
      }
    }
    return undefined
  }

  private toSummary(record: SessionRecordLike, snapshot: SessionLogSnapshotLike): SessionManagerSessionSummary {
    const events = snapshot.events
    let title = record.header.id
    let lastPromptAt: number | undefined
    let turns = 0
    let steps = 0
    for (const event of events) {
      if (event.type === 'session/title') {
        const data = event.data as { title?: unknown } | undefined
        if (typeof data?.title === 'string' && data.title.length > 0) title = data.title
      } else if (event.type === 'user/message') {
        const data = event.data as { source?: { kind?: unknown } } | undefined
        if (data?.source?.kind === 'user') lastPromptAt = event.time
      } else if (event.type === 'turn/start') {
        turns += 1
      } else if (event.type === 'step/start') {
        steps += 1
      }
    }
    const summary: SessionManagerSessionSummary = {
      sessionId: record.header.id,
      title,
      cwd: record.header.cwd ?? '',
      agentPreset: record.header.agentPreset ?? '',
      updatedAt: Math.max(record.header.createdAt, lastPromptAt ?? 0),
      blank: turns === 0,
      running: this.agents().get(record.header.id)?.status === 'running',
      turns,
      steps,
    }
    if (lastPromptAt !== undefined) summary.lastPromptAt = lastPromptAt
    return summary
  }

  private async summarizeRecords(records: SessionRecordLike[]): Promise<SessionManagerSessionSummary[]> {
    const summaries = new Array<SessionManagerSessionSummary>(records.length)
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < records.length) {
        const index = cursor
        cursor += 1
        const record = records[index]
        if (record === undefined) continue
        try {
          const snapshot = await this.readSession(record.header.id)
          summaries[index] = this.toSummary(record, snapshot)
        } catch (error) {
          this.ctx.logger.warn(
            `[dsh-session-manager] failed to summarize ${record.header.id}; using header-only fallback: ${String(error)}`,
          )
          summaries[index] = {
            sessionId: record.header.id,
            title: record.header.id,
            cwd: record.header.cwd ?? '',
            agentPreset: record.header.agentPreset ?? '',
            updatedAt: record.header.createdAt,
            blank: false,
            running: this.agents().get(record.header.id)?.status === 'running',
          }
        }
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(SUMMARY_READ_CONCURRENCY, records.length) },
      () => worker(),
    ))
    return summaries
  }

  @Remote('list')
  async list(request: Record<string, never>): Promise<SessionManagerSessionSummary[]> {
    void request
    const records = await this.listSessionRecords()
    return (await this.summarizeRecords(records))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  @Remote('readHistory')
  async readHistory(request: {
    sessionId: string
    limit?: number
  }): Promise<SessionManagerHistoryPage> {
    const sessionId = assertSessionId(request.sessionId)
    const limit = typeof request.limit === 'number' && request.limit > 0
      ? Math.min(Math.floor(request.limit), this.config.previewMessageLimit)
      : this.config.previewMessageLimit
    const snapshot = await this.readSession(sessionId)
    const selected = snapshot.events.slice(-limit)
    const events: SessionManagerHistoryEvent[] = selected.map((event) => {
      const { seq: _seq, type: _type, ...rest } = event
      void _seq; void _type
      return { seq: event.seq, type: event.type, ...rest }
    })
    const reachedStart = selected.length === snapshot.events.length
    const page: SessionManagerHistoryPage = { events, reachedStart }
    if (!reachedStart && selected[0] !== undefined) page.beforeSeq = selected[0].seq - 1
    return page
  }

  @Remote('delete')
  async delete(request: { sessionId: string }): Promise<{ sessionId: string }> {
    const sessionId = assertSessionId(request.sessionId)
    const records = await this.listSessionRecords()
    const target = records.find(item => item.header.id === sessionId)
    if (!target) {
      throw new PublicSessionError('not-found', `Session ${sessionId} does not exist.`)
    }
    if (target.live) {
      throw new PublicSessionError(
        'session-running',
        'Refusing to delete a running session. Stop it first.',
      )
    }
    const directory = await this.findSessionDirectory(sessionId)
    if (!directory) {
      throw new PublicSessionError('not-found', `Session directory for ${sessionId} is missing.`)
    }
    try {
      await fs.rm(directory, { recursive: true, force: true })
    } catch (error) {
      const errno = (error as NodeJS.ErrnoException).code
      if (errno === 'EACCES' || errno === 'EPERM') {
        throw new PublicSessionError('permission-denied', `Cannot delete ${sessionId}.`)
      }
      throw new PublicSessionError(
        'upstream-error',
        `Failed to delete session: ${(error as Error).message}`,
      )
    }
    this.ctx.logger.info(`[dsh-session-manager] deleted session ${sessionId}`)
    return { sessionId }
  }

  @Remote('export')
  async export(request: {
    sessionId: string
    format: SessionExportFormat
  }): Promise<SessionManagerExportResult> {
    const sessionId = assertSessionId(request.sessionId)
    const format: SessionExportFormat = request.format === 'markdown' ? 'markdown' : 'json'
    const events = (await this.readSession(sessionId)).events
    const body = format === 'json' ? this.toJson(events, sessionId) : this.toMarkdown(events, sessionId)
    const bytes = Buffer.byteLength(body, 'utf8')
    if (bytes > this.config.maxExportBytes) {
      throw new PublicSessionError(
        'too-large',
        `Session payload is ${bytes} bytes, exceeding limit of ${this.config.maxExportBytes}.`,
      )
    }
    const extension = format === 'json' ? 'json' : 'md'
    return {
      filename: `${sessionId}.${extension}`,
      mime: format === 'json' ? 'application/json' : 'text/markdown',
      base64: Buffer.from(body, 'utf8').toString('base64'),
      bytes,
      eventCount: events.length,
    }
  }

  private toJson(events: SessionEventLike[], sessionId: string): string {
    return `${JSON.stringify({ sessionId, exportedAt: Date.now(), events }, null, 2)}\n`
  }

  private toMarkdown(events: SessionManagerHistoryEvent[], sessionId: string): string {
    const lines: string[] = []
    lines.push(`# Session ${sessionId}`)
    lines.push('')
    lines.push(`Exported at ${new Date().toISOString()} (${events.length} events)`)
    lines.push('')
    for (const event of events) {
      lines.push(`## seq ${event.seq} · ${event.type}`)
      lines.push('')
      lines.push('```json')
      lines.push(JSON.stringify(event, null, 2))
      lines.push('```')
      lines.push('')
    }
    return lines.join('\n')
  }
}

export type {
  SessionExportFormat,
  SessionManagerConfig,
  SessionManagerErrorCode,
  SessionManagerExportResult,
  SessionManagerHistoryEvent,
  SessionManagerHistoryPage,
  SessionManagerSessionSummary,
} from './types.js'

// Reference mark to keep TS aware of usage in conditional branches.
void SESSION_ID_PATTERN
