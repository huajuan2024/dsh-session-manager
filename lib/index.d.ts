import { type Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import type { SessionExportFormat, SessionManagerConfig, SessionManagerExportResult, SessionManagerHistoryPage, SessionManagerSessionSummary } from './types.js';
export default class SessionManagerService extends TypertRemoteService {
    static inject: readonly ["sessionQuery", "agents"];
    static Config: z<Schemastery.ObjectS<{
        sessionsRoot: z<string, string>;
        maxExportBytes: z<number, number>;
        previewMessageLimit: z<number, number>;
    }>, Schemastery.ObjectT<{
        sessionsRoot: z<string, string>;
        maxExportBytes: z<number, number>;
        previewMessageLimit: z<number, number>;
    }>>;
    private readonly config;
    private readonly sessionsRoot;
    constructor(ctx: Context, config?: SessionManagerConfig);
    /** Map a session-query failure into the plugin's browser-safe vocabulary. */
    private wrapQueryFailure;
    private sessionQuery;
    private agents;
    private listSessionRecords;
    private readSession;
    private sessionDirectory;
    private findSessionDirectory;
    private toSummary;
    private summarizeRecords;
    list(request: Record<string, never>): Promise<SessionManagerSessionSummary[]>;
    readHistory(request: {
        sessionId: string;
        limit?: number;
    }): Promise<SessionManagerHistoryPage>;
    delete(request: {
        sessionId: string;
    }): Promise<{
        sessionId: string;
    }>;
    export(request: {
        sessionId: string;
        format: SessionExportFormat;
    }): Promise<SessionManagerExportResult>;
    private toJson;
    private toMarkdown;
}
export type { SessionExportFormat, SessionManagerConfig, SessionManagerErrorCode, SessionManagerExportResult, SessionManagerHistoryEvent, SessionManagerHistoryPage, SessionManagerSessionSummary, } from './types.js';
//# sourceMappingURL=index.d.ts.map