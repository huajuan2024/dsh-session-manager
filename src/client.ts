type SessionSummary = {
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

type HistoryEvent = {
  seq: number
  type: string
  [key: string]: unknown
}

type HistoryPage = {
  events: HistoryEvent[]
  beforeSeq?: number
  reachedStart?: boolean
}

type ExportFormat = 'json' | 'markdown'

type ExportResult = {
  filename: string
  mime: string
  base64: string
  bytes: number
  eventCount: number
}

type DeleteResult = { sessionId: string }

type RpcFailure = { ok: false, error: { code: string, message: string } }
type RpcSuccess<T> = { ok: true, value: T }
type RpcResult<T> = RpcSuccess<T> | RpcFailure

type SessionManagerStore = {
  sessions: SessionSummary[]
  loading: boolean
  loaded: boolean
  error: string | undefined
  expanded: Set<string>
  historyBySession: Map<string, HistoryPage>
  historyLoading: Set<string>
  historyError: Map<string, string>
  pendingDelete: Set<string>
  pendingExport: Set<string>
  lastMessage: { kind: 'success' | 'error', text: string } | undefined
}

type StoreListener = () => void

;(window as unknown as {
  __ModuleLoader__: {
    load(options: {
      id: string
      factory: (require: (id: string) => unknown) => unknown
    }): void
  }
}).__ModuleLoader__.load({
  id: 'dsh-session-manager',
  factory: (require) => {
    const module = { exports: {} as { apply?: (ctx: unknown) => void; inject?: readonly string[] } }
    const React = require('react') as { createElement: typeof import('react').createElement }
    const h = React.createElement
    const namespace = 'sessionManager'

    type Translate = (key: string) => string

    const zh = {
      title: '会话管理',
      tabLabel: '会话',
      loading: '正在读取会话列表…',
      noSessions: '暂无会话',
      refresh: '刷新',
      refreshing: '刷新中…',
      view: '查看',
      hide: '收起',
      delete: '删除',
      deleteConfirm: '确认永久删除',
      cannotUndo: '此操作不可恢复。',
      confirm: '确认删除',
      cancel: '取消',
      exportJson: '导出 JSON',
      exportMarkdown: '导出 Markdown',
      exporting: '导出中…',
      exportFailed: '导出失败',
      deleteFailed: '删除失败',
      loadFailed: '读取会话失败',
      historyFailed: '读取历史失败',
      sessionRunning: '该会话正在运行中,无法删除',
      sessionNotFound: '会话不存在',
      invalidId: '无效的会话 ID',
      tooLarge: '会话过大,暂不支持导出',
      blank: '空会话',
      running: '运行中',
      turnUnit: '轮',
      stepUnit: '步',
      updated: '更新于',
      justNow: '刚刚',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前',
      historyTitle: '会话历史',
      eventUnit: '条事件',
      noEvents: '该会话暂无事件',
      close: '关闭',
    }

    const en = {
      title: 'Session Manager',
      tabLabel: 'Sessions',
      loading: 'Loading sessions…',
      noSessions: 'No sessions yet.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      view: 'View',
      hide: 'Hide',
      delete: 'Delete',
      deleteConfirm: 'Permanently delete',
      cannotUndo: 'This cannot be undone.',
      confirm: 'Delete',
      cancel: 'Cancel',
      exportJson: 'Export JSON',
      exportMarkdown: 'Export Markdown',
      exporting: 'Exporting…',
      exportFailed: 'Export failed',
      deleteFailed: 'Delete failed',
      loadFailed: 'Failed to load sessions',
      historyFailed: 'Failed to load history',
      sessionRunning: 'This session is running; cannot delete.',
      sessionNotFound: 'Session not found.',
      invalidId: 'Invalid session id.',
      tooLarge: 'Session is too large to export.',
      blank: 'blank',
      running: 'running',
      turnUnit: 'turns',
      stepUnit: 'steps',
      updated: 'updated',
      justNow: 'just now',
      minutesAgo: 'minutes ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago',
      historyTitle: 'Session history',
      eventUnit: 'events',
      noEvents: 'No events recorded.',
      close: 'Close',
    }

    const css = `
.dsm-panel{max-width:920px;padding:4px}
.dsm-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.dsm-title{font-weight:650;font-size:15px}
.dsm-error,.dsm-info{margin:8px 0;padding:8px 10px;border-radius:8px;font-size:13px}
.dsm-error{background:rgba(209,36,47,.09);color:#b42318}
.dsm-info{background:rgba(34,160,107,.09);color:#11633a}
.dsm-list{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:12px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
.dsm-row{padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.12))}
.dsm-row:first-child{border-top:0}
.dsm-summary{display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer}
.dsm-summary-main{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.dsm-summary-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-summary-meta{font-size:12px;color:var(--dsw-alias-label-secondary,#667085);display:flex;gap:8px;flex-wrap:wrap}
.dsm-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25))}
.dsm-pill.running{background:rgba(34,160,107,.16);color:#0a6f3d;border-color:transparent}
.dsm-pill.blank{background:rgba(128,128,128,.12);color:#5b6471;border-color:transparent}
.dsm-actions{display:flex;gap:6px;flex-wrap:wrap}
.dsm-button{padding:5px 10px;border:0;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f2f4f7);color:inherit;cursor:pointer;font-size:12px}
.dsm-button:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.18))}
.dsm-button.danger{background:rgba(209,36,47,.12);color:#b42318}
.dsm-button.danger:hover{background:rgba(209,36,47,.22)}
.dsm-button:disabled{opacity:.5;cursor:not-allowed}
.dsm-detail{margin-top:10px;padding:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));border-radius:8px}
.dsm-detail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:600;font-size:13px}
.dsm-event{padding:6px 8px;margin:4px 0;border-radius:6px;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;overflow-x:auto}
.dsm-confirm{margin-top:8px;padding:8px;background:rgba(209,36,47,.08);border-radius:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}
.dsm-muted{color:var(--dsw-alias-label-secondary,#667085);font-size:12px;padding:16px;text-align:center}
`

    function installStyles() {
      const existing = document.getElementById('dsh-session-manager-style')
      if (existing) return () => undefined
      const tag = document.createElement('style')
      tag.id = 'dsh-session-manager-style'
      tag.textContent = css
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    function createStore() {
      const state: SessionManagerStore = {
        sessions: [],
        loading: false,
        loaded: false,
        error: undefined,
        expanded: new Set(),
        historyBySession: new Map(),
        historyLoading: new Set(),
        historyError: new Map(),
        pendingDelete: new Set(),
        pendingExport: new Set(),
        lastMessage: undefined,
      }
      const listeners = new Set<StoreListener>()
      const publish = (next: SessionManagerStore) => {
        state.sessions = next.sessions
        state.loading = next.loading
        state.loaded = next.loaded
        state.error = next.error
        state.expanded = next.expanded
        state.historyBySession = next.historyBySession
        state.historyLoading = next.historyLoading
        state.historyError = next.historyError
        state.pendingDelete = next.pendingDelete
        state.pendingExport = next.pendingExport
        state.lastMessage = next.lastMessage
        for (const listener of listeners) listener()
      }
      const subscribe = (listener: StoreListener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
      const getState = () => state
      return { state, publish, subscribe, getState }
    }

    type Store = ReturnType<typeof createStore>

    function useStore(store: Store): SessionManagerStore {
      const [snap, setSnap] = (React as unknown as { useState<T>(value: T): [T, (v: T) => void] }).useState(store.state)
      ;(React as unknown as { useEffect(effect: () => void | (() => void), deps: unknown[]): void }).useEffect(
        () => store.subscribe(() => setSnap({ ...store.state })),
        [store],
      )
      return snap
    }

    function buildApi(ctx: unknown) {
      const connection = (ctx as { connection: { rpc: { call: (channel: string, endpoint: string, payload: unknown) => Promise<RpcResult<unknown>> } } }).connection
      async function call<T>(method: string, request: unknown): Promise<T> {
        const result = await connection.rpc.call('/api', `sessionManager/${method}`, { args: { request } })
        if (result.ok === true) return result.value as T
        throw new Error(result.error.message)
      }
      return {
        list: () => call<SessionSummary[]>('list', {}),
        readHistory: (sessionId: string, limit?: number) =>
          call<HistoryPage>('readHistory', { sessionId, limit }),
        deleteSession: (sessionId: string) => call<DeleteResult>('delete', { sessionId }),
        exportSession: (sessionId: string, format: ExportFormat) =>
          call<ExportResult>('export', { sessionId, format }),
      }
    }

    type Api = ReturnType<typeof buildApi>

    function formatRelativeTime(timestamp: number, t: Translate): string {
      if (!timestamp) return ''
      const diff = Date.now() - timestamp
      if (diff < 60_000) return `${t('updated')} ${t('justNow')}`
      if (diff < 3_600_000) return `${t('updated')} ${Math.floor(diff / 60_000)} ${t('minutesAgo')}`
      if (diff < 86_400_000) return `${t('updated')} ${Math.floor(diff / 3_600_000)} ${t('hoursAgo')}`
      return `${t('updated')} ${Math.floor(diff / 86_400_000)} ${t('daysAgo')}`
    }

    function shortCwd(value: string): string {
      if (!value) return '—'
      const parts = value.split('/').filter(Boolean)
      if (parts.length <= 2) return value
      return `…/${parts.slice(-2).join('/')}`
    }

    function triggerDownload(result: ExportResult) {
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: result.mime })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function SessionRow({
      summary, store, api, t,
    }: { summary: SessionSummary; store: Store; api: Api; t: Translate }) {
      const snap = useStore(store)
      const isExpanded = snap.expanded.has(summary.sessionId)
      const isDeleting = snap.pendingDelete.has(summary.sessionId)
      const isExportingJson = snap.pendingExport.has(`${summary.sessionId}:json`)
      const isExportingMd = snap.pendingExport.has(`${summary.sessionId}:markdown`)
      const history = snap.historyBySession.get(summary.sessionId)
      const historyLoading = snap.historyLoading.has(summary.sessionId)
      const historyError = snap.historyError.get(summary.sessionId)

      const toggleExpand = async () => {
        const nextExpanded = new Set(snap.expanded)
        if (isExpanded) nextExpanded.delete(summary.sessionId)
        else nextExpanded.add(summary.sessionId)
        store.publish({ ...snap, expanded: nextExpanded })
        if (!isExpanded && !snap.historyBySession.has(summary.sessionId)) {
          const nextLoading = new Set(snap.historyLoading)
          nextLoading.add(summary.sessionId)
          store.publish({ ...snap, expanded: nextExpanded, historyLoading: nextLoading })
          try {
            const page = await api.readHistory(summary.sessionId)
            const nextHistory = new Map(snap.historyBySession)
            nextHistory.set(summary.sessionId, page)
            store.publish({ ...store.state, expanded: nextExpanded, historyBySession: nextHistory, historyLoading: new Set() })
          } catch (error) {
            const nextError = new Map(snap.historyError)
            nextError.set(summary.sessionId, error instanceof Error ? error.message : String(error))
            store.publish({ ...store.state, expanded: nextExpanded, historyLoading: new Set(), historyError: nextError })
          }
        }
      }

      const beginDelete = () => {
        const next = new Set(snap.pendingDelete)
        next.add(summary.sessionId)
        store.publish({ ...snap, pendingDelete: next })
      }
      const cancelDelete = () => {
        const next = new Set(snap.pendingDelete)
        next.delete(summary.sessionId)
        store.publish({ ...snap, pendingDelete: next })
      }
      const confirmDelete = async () => {
        try {
          await api.deleteSession(summary.sessionId)
          const nextSessions = snap.sessions.filter((s) => s.sessionId !== summary.sessionId)
          const nextExpanded = new Set(snap.expanded)
          nextExpanded.delete(summary.sessionId)
          store.publish({
            ...snap,
            sessions: nextSessions,
            expanded: nextExpanded,
            pendingDelete: new Set(),
            lastMessage: { kind: 'success', text: `Deleted ${summary.sessionId}` },
          })
        } catch (error) {
          const next = new Set(snap.pendingDelete)
          next.delete(summary.sessionId)
          store.publish({
            ...snap,
            pendingDelete: next,
            lastMessage: { kind: 'error', text: `${t('deleteFailed')}: ${error instanceof Error ? error.message : String(error)}` },
          })
        }
      }

      const exportAs = async (format: ExportFormat) => {
        const key = `${summary.sessionId}:${format}`
        const next = new Set(snap.pendingExport)
        next.add(key)
        store.publish({ ...snap, pendingExport: next })
        try {
          const result = await api.exportSession(summary.sessionId, format)
          triggerDownload(result)
          const cleared = new Set(store.state.pendingExport)
          cleared.delete(key)
          store.publish({ ...store.state, pendingExport: cleared, lastMessage: { kind: 'success', text: `Exported ${result.filename} (${result.eventCount} events)` } })
        } catch (error) {
          const cleared = new Set(store.state.pendingExport)
          cleared.delete(key)
          store.publish({ ...store.state, pendingExport: cleared, lastMessage: { kind: 'error', text: `${t('exportFailed')}: ${error instanceof Error ? error.message : String(error)}` } })
        }
      }

      return h('div', { className: 'dsm-row', key: summary.sessionId },
        h('div', { className: 'dsm-summary', onClick: () => void toggleExpand() },
          h('div', { className: 'dsm-summary-main' },
            h('div', { className: 'dsm-summary-title' }, summary.title || summary.sessionId),
            h('div', { className: 'dsm-summary-meta' },
              h('span', null, shortCwd(summary.cwd)),
              h('span', null, summary.agentPreset || '—'),
              typeof summary.turns === 'number' ? h('span', null, `${summary.turns} ${t('turnUnit')}`) : null,
              typeof summary.steps === 'number' ? h('span', null, `${summary.steps} ${t('stepUnit')}`) : null,
              summary.updatedAt ? h('span', null, formatRelativeTime(summary.updatedAt, t)) : null,
              summary.running ? h('span', { className: 'dsm-pill running' }, t('running')) : null,
              summary.blank ? h('span', { className: 'dsm-pill blank' }, t('blank')) : null,
            ),
          ),
          h('div', { className: 'dsm-actions', onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
            h('button', { className: 'dsm-button', onClick: () => void toggleExpand() }, isExpanded ? t('hide') : t('view')),
            h('button', { className: 'dsm-button', onClick: () => void exportAs('json'), disabled: isExportingJson }, isExportingJson ? t('exporting') : t('exportJson')),
            h('button', { className: 'dsm-button', onClick: () => void exportAs('markdown'), disabled: isExportingMd }, isExportingMd ? t('exporting') : t('exportMarkdown')),
            h('button', { className: 'dsm-button danger', onClick: beginDelete, disabled: isDeleting || summary.running }, t('delete')),
          ),
        ),
        isExpanded ? h('div', { className: 'dsm-detail' },
          h('div', { className: 'dsm-detail-head' }, `${t('historyTitle')}: ${summary.sessionId}`),
          historyLoading ? h('div', { className: 'dsm-muted' }, t('refreshing')) : null,
          historyError ? h('div', { className: 'dsm-error' }, `${t('historyFailed')}: ${historyError}`) : null,
          history
            ? h('div', null,
                h('div', { className: 'dsm-muted' }, `${history.events.length} ${t('eventUnit')}`),
                ...history.events.slice(0, 50).map((event) => h('div', { className: 'dsm-event', key: event.seq }, `seq ${event.seq} · ${event.type}\n${JSON.stringify(event, null, 2)}`)),
              )
            : null,
        ) : null,
        isDeleting ? h('div', { className: 'dsm-confirm' },
          h('span', null, `${t('deleteConfirm')} ${summary.sessionId}? ${t('cannotUndo')}`),
          h('button', { className: 'dsm-button danger', onClick: confirmDelete }, t('confirm')),
          h('button', { className: 'dsm-button', onClick: cancelDelete }, t('cancel')),
        ) : null,
      )
    }

    function SessionPanel({ store, api, t }: { store: Store; api: Api; t: Translate }) {
      const snap = useStore(store)
      const refresh = async () => {
        store.publish({ ...snap, loading: true, error: undefined })
        try {
          const sessions = await api.list()
          store.publish({ ...store.state, sessions, loading: false, loaded: true })
        } catch (error) {
          store.publish({ ...store.state, loading: false, loaded: true, error: error instanceof Error ? error.message : String(error) })
        }
      }

      ;(React as unknown as { useEffect(effect: () => void, deps: unknown[]): void }).useEffect(() => { void refresh() }, [])

      return h('div', { className: 'dsm-panel' },
        h('div', { className: 'dsm-head' },
          h('div', { className: 'dsm-title' }, t('title')),
          h('button', { className: 'dsm-button', onClick: () => void refresh(), disabled: snap.loading }, snap.loading ? t('refreshing') : t('refresh')),
        ),
        snap.lastMessage
          ? h('div', { className: snap.lastMessage.kind === 'error' ? 'dsm-error' : 'dsm-info' }, snap.lastMessage.text)
          : null,
        snap.error ? h('div', { className: 'dsm-error' }, `${t('loadFailed')}: ${snap.error}`) : null,
        snap.loading && !snap.loaded ? h('div', { className: 'dsm-muted' }, t('loading')) : null,
        snap.loaded && snap.sessions.length === 0 ? h('div', { className: 'dsm-muted' }, t('noSessions')) : null,
        snap.sessions.length > 0 ? h('div', { className: 'dsm-list' },
          ...snap.sessions.map((summary) => h(SessionRow, { summary, store, api, t, key: summary.sessionId })),
        ) : null,
      )
    }

    const inject = ['connection', 'locale', 'slots'] as const
    function apply(ctx: unknown) {
      const c = ctx as {
        effect: (fn: () => void | (() => void), label: string) => void
        locale: { register(namespace: string, translations: Record<string, unknown>): void; bind(namespace: string): (key: string) => string }
        slots: { inject(slot: string, register: () => void): void; register<T>(spec: { name: string; id: string; order?: number; label?: () => string }, panel: T): void }
      }
      const t: Translate = ((key: string) => {
        try {
          return c.locale.bind(namespace)(key)
        } catch {
          return key
        }
      })
      const tStr = (key: string): string => t(key)
      c.effect(() => c.locale.register(namespace, { zh, en }), 'dsh-session-manager: locale')
      c.effect(installStyles, 'dsh-session-manager: styles')
      const store = createStore()
      const api = buildApi(ctx)
      c.effect(() => () => {}, 'dsh-session-manager: store')
      const SettingsPanel = () => h(SessionPanel, { store, api, t })
      c.slots.inject('settings.plugins.tab', () =>
        c.slots.register({ name: 'settings.plugins.tab', id: 'session-manager', order: 110, label: () => tStr('title') }, SettingsPanel),
      )
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
