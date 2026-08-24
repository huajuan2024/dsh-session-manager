/** Public DTO exposed by `dsh-session-manager` to the Web client. */

export type SessionExportFormat = 'json' | 'markdown'

export type SessionManagerErrorCode =
  /** Session is currently running; refusing to mutate or export it. */
  | 'session-running'
  /** The requested session id is unknown to the Host. */
  | 'not-found'
  /** sessionId was neither a UUID (case-insensitive) nor a `session-` prefixed one. */
  | 'invalid-session-id'
  /** Host cannot read or delete the on-disk session directory. */
  | 'permission-denied'
  /** Underlying session-history RPC or filesystem returned an error. */
  | 'upstream-error'
  /** Session payload exceeds `maxExportBytes`. */
  | 'too-large'

/**
 * Reduced session summary sent to the browser. Mirrors a subset of the
 * existing `session.list` response so the client does not have to know the
 * internal `SessionSummary` shape.
 */
export interface SessionManagerSessionSummary {
  sessionId: string
  title: string
  cwd: string
  agentPreset: string
  updatedAt: number
  blank: boolean
  running: boolean
  turns?: number
  steps?: number
  lastPromptAt?: number
}

/**
 * One message event as produced by `session.history`. Kept intentionally
 * loose so the Host can forward DSH's own `SessionEvent` shape verbatim
 * without forcing the client to import the deepseek-harness package.
 */
export interface SessionManagerHistoryEvent {
  seq: number
  type: string
  [key: string]: unknown
}

/** Result of `readHistory`. Mirrors the shape returned by `session.history`. */
export interface SessionManagerHistoryPage {
  events: SessionManagerHistoryEvent[]
  beforeSeq?: number
  reachedStart?: boolean
}

/** Result of `export`. */
export interface SessionManagerExportResult {
  filename: string
  mime: string
  base64: string
  bytes: number
  eventCount: number
}

/** Public configuration accepted by the service. */
export interface SessionManagerConfig {
  sessionsRoot?: string
  maxExportBytes?: number
  previewMessageLimit?: number
}
