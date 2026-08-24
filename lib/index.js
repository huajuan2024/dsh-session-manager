var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
// Root sessions historically use `session-<uuid>`, while newer DSH subagent
// sessions use the bare UUID. Keep this allowlist deliberately narrower than
// arbitrary session ids because the validated value is later used as a path
// segment when locating a persisted session directory.
const SESSION_ID_PATTERN = /^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_HISTORY_PAGE_SIZE = 200;
const SUMMARY_READ_CONCURRENCY = 4;
function expandHome(value) {
    if (value === '~')
        return os.homedir();
    if (value.startsWith('~/'))
        return path.join(os.homedir(), value.slice(2));
    return value;
}
/**
 * Error thrown by the Host when a request must surface a typed failure to the
 * browser. Mirrors `PublicUsageError` in the sibling minimax plugin.
 */
class PublicSessionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'PublicSessionError';
    }
}
function assertSessionId(value) {
    if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
        throw new PublicSessionError('invalid-session-id', 'sessionId must be a UUID, optionally prefixed with session-.');
    }
    return value;
}
let SessionManagerService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _readHistory_decorators;
    let _delete_decorators;
    let _export_decorators;
    return class SessionManagerService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _readHistory_decorators = [Remote('readHistory')];
            _delete_decorators = [Remote('delete')];
            _export_decorators = [Remote('export')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readHistory_decorators, { kind: "method", name: "readHistory", static: false, private: false, access: { has: obj => "readHistory" in obj, get: obj => obj.readHistory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _export_decorators, { kind: "method", name: "export", static: false, private: false, access: { has: obj => "export" in obj, get: obj => obj.export }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['sessionQuery', 'agents'];
        static Config = z.object({
            sessionsRoot: z.string().default('~/.dsh/sessions'),
            maxExportBytes: z.number().step(1).min(1024).default(10 * 1024 * 1024),
            previewMessageLimit: z.number().step(1).min(1).max(2000).default(DEFAULT_HISTORY_PAGE_SIZE),
        });
        config = __runInitializers(this, _instanceExtraInitializers);
        sessionsRoot;
        constructor(ctx, config = {}) {
            super(ctx, 'sessionManager');
            this.config = {
                sessionsRoot: config.sessionsRoot ?? '~/.dsh/sessions',
                maxExportBytes: config.maxExportBytes ?? 10 * 1024 * 1024,
                previewMessageLimit: config.previewMessageLimit ?? DEFAULT_HISTORY_PAGE_SIZE,
            };
            this.sessionsRoot = expandHome(this.config.sessionsRoot);
        }
        /** Map a session-query failure into the plugin's browser-safe vocabulary. */
        wrapQueryFailure(failure) {
            const record = typeof failure === 'object' && failure !== null
                ? failure
                : undefined;
            const upstreamCode = typeof record?.code === 'string' ? record.code : '';
            const message = typeof record?.message === 'string'
                ? record.message
                : failure instanceof Error ? failure.message : String(failure);
            const known = {
                SESSION_QUERY_SESSION_NOT_FOUND: 'not-found',
                SESSION_QUERY_INVALID_QUERY: 'invalid-session-id',
                EACCES: 'permission-denied',
                EPERM: 'permission-denied',
            };
            return new PublicSessionError(known[upstreamCode] ?? 'upstream-error', message);
        }
        sessionQuery() {
            return this.ctx.sessionQuery;
        }
        agents() {
            return this.ctx.agents;
        }
        async listSessionRecords() {
            try {
                return await this.sessionQuery().listSessions();
            }
            catch (error) {
                throw this.wrapQueryFailure(error);
            }
        }
        async readSession(sessionId) {
            try {
                return await this.sessionQuery().readSession(sessionId);
            }
            catch (error) {
                throw this.wrapQueryFailure(error);
            }
        }
        sessionDirectory(sessionId) {
            // DSH stores sessions under <sessionsRoot>/<cwdEncoded>/<sessionId>/.
            // Walking the entire root lets us delete the session regardless of which
            // project directory owns it; we never accept a cwd from the client.
            return path.join(this.sessionsRoot, '_lookup_', sessionId);
        }
        async findSessionDirectory(sessionId) {
            let entries;
            try {
                entries = await fs.readdir(this.sessionsRoot, { withFileTypes: true });
            }
            catch {
                return undefined;
            }
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const candidate = path.join(this.sessionsRoot, entry.name, sessionId);
                try {
                    const stat = await fs.stat(candidate);
                    if (stat.isDirectory())
                        return candidate;
                }
                catch {
                    continue;
                }
            }
            return undefined;
        }
        toSummary(record, snapshot) {
            const events = snapshot.events;
            let title = record.header.id;
            let lastPromptAt;
            let turns = 0;
            let steps = 0;
            for (const event of events) {
                if (event.type === 'session/title') {
                    const data = event.data;
                    if (typeof data?.title === 'string' && data.title.length > 0)
                        title = data.title;
                }
                else if (event.type === 'user/message') {
                    const data = event.data;
                    if (data?.source?.kind === 'user')
                        lastPromptAt = event.time;
                }
                else if (event.type === 'turn/start') {
                    turns += 1;
                }
                else if (event.type === 'step/start') {
                    steps += 1;
                }
            }
            const summary = {
                sessionId: record.header.id,
                title,
                cwd: record.header.cwd ?? '',
                agentPreset: record.header.agentPreset ?? '',
                updatedAt: Math.max(record.header.createdAt, lastPromptAt ?? 0),
                blank: turns === 0,
                running: this.agents().get(record.header.id)?.status === 'running',
                turns,
                steps,
            };
            if (lastPromptAt !== undefined)
                summary.lastPromptAt = lastPromptAt;
            return summary;
        }
        async summarizeRecords(records) {
            const summaries = new Array(records.length);
            let cursor = 0;
            const worker = async () => {
                while (cursor < records.length) {
                    const index = cursor;
                    cursor += 1;
                    const record = records[index];
                    if (record === undefined)
                        continue;
                    try {
                        const snapshot = await this.readSession(record.header.id);
                        summaries[index] = this.toSummary(record, snapshot);
                    }
                    catch (error) {
                        this.ctx.logger.warn(`[dsh-session-manager] failed to summarize ${record.header.id}; using header-only fallback: ${String(error)}`);
                        summaries[index] = {
                            sessionId: record.header.id,
                            title: record.header.id,
                            cwd: record.header.cwd ?? '',
                            agentPreset: record.header.agentPreset ?? '',
                            updatedAt: record.header.createdAt,
                            blank: false,
                            running: this.agents().get(record.header.id)?.status === 'running',
                        };
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(SUMMARY_READ_CONCURRENCY, records.length) }, () => worker()));
            return summaries;
        }
        async list(request) {
            void request;
            const records = await this.listSessionRecords();
            return (await this.summarizeRecords(records))
                .sort((a, b) => b.updatedAt - a.updatedAt);
        }
        async readHistory(request) {
            const sessionId = assertSessionId(request.sessionId);
            const limit = typeof request.limit === 'number' && request.limit > 0
                ? Math.min(Math.floor(request.limit), this.config.previewMessageLimit)
                : this.config.previewMessageLimit;
            const snapshot = await this.readSession(sessionId);
            const selected = snapshot.events.slice(-limit);
            const events = selected.map((event) => {
                const { seq: _seq, type: _type, ...rest } = event;
                void _seq;
                void _type;
                return { seq: event.seq, type: event.type, ...rest };
            });
            const reachedStart = selected.length === snapshot.events.length;
            const page = { events, reachedStart };
            if (!reachedStart && selected[0] !== undefined)
                page.beforeSeq = selected[0].seq - 1;
            return page;
        }
        async delete(request) {
            const sessionId = assertSessionId(request.sessionId);
            const records = await this.listSessionRecords();
            const target = records.find(item => item.header.id === sessionId);
            if (!target) {
                throw new PublicSessionError('not-found', `Session ${sessionId} does not exist.`);
            }
            if (target.live) {
                throw new PublicSessionError('session-running', 'Refusing to delete a running session. Stop it first.');
            }
            const directory = await this.findSessionDirectory(sessionId);
            if (!directory) {
                throw new PublicSessionError('not-found', `Session directory for ${sessionId} is missing.`);
            }
            try {
                await fs.rm(directory, { recursive: true, force: true });
            }
            catch (error) {
                const errno = error.code;
                if (errno === 'EACCES' || errno === 'EPERM') {
                    throw new PublicSessionError('permission-denied', `Cannot delete ${sessionId}.`);
                }
                throw new PublicSessionError('upstream-error', `Failed to delete session: ${error.message}`);
            }
            this.ctx.logger.info(`[dsh-session-manager] deleted session ${sessionId}`);
            return { sessionId };
        }
        async export(request) {
            const sessionId = assertSessionId(request.sessionId);
            const format = request.format === 'markdown' ? 'markdown' : 'json';
            const events = (await this.readSession(sessionId)).events;
            const body = format === 'json' ? this.toJson(events, sessionId) : this.toMarkdown(events, sessionId);
            const bytes = Buffer.byteLength(body, 'utf8');
            if (bytes > this.config.maxExportBytes) {
                throw new PublicSessionError('too-large', `Session payload is ${bytes} bytes, exceeding limit of ${this.config.maxExportBytes}.`);
            }
            const extension = format === 'json' ? 'json' : 'md';
            return {
                filename: `${sessionId}.${extension}`,
                mime: format === 'json' ? 'application/json' : 'text/markdown',
                base64: Buffer.from(body, 'utf8').toString('base64'),
                bytes,
                eventCount: events.length,
            };
        }
        toJson(events, sessionId) {
            return `${JSON.stringify({ sessionId, exportedAt: Date.now(), events }, null, 2)}\n`;
        }
        toMarkdown(events, sessionId) {
            const lines = [];
            lines.push(`# Session ${sessionId}`);
            lines.push('');
            lines.push(`Exported at ${new Date().toISOString()} (${events.length} events)`);
            lines.push('');
            for (const event of events) {
                lines.push(`## seq ${event.seq} · ${event.type}`);
                lines.push('');
                lines.push('```json');
                lines.push(JSON.stringify(event, null, 2));
                lines.push('```');
                lines.push('');
            }
            return lines.join('\n');
        }
    };
})();
export default SessionManagerService;
// Reference mark to keep TS aware of usage in conditional branches.
void SESSION_ID_PATTERN;
//# sourceMappingURL=index.js.map