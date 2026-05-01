import { EventEmitter } from 'events';
import { ProxyLogEntry } from './types';

export class ProxyLogger extends EventEmitter {
    private logs: ProxyLogEntry[] = [];
    private debugLogs: Array<{timestamp: string, message: string}> = [];
    private maxLogs: number = 200;
    private maxDebugLogs: number = 500;

    constructor(maxLogs: number = 200, maxDebugLogs: number = 500) {
        super();
        this.maxLogs = maxLogs;
        this.maxDebugLogs = maxDebugLogs;
    }

    public addDebugLog(message: string): void {
        const entry = {
            timestamp: new Date().toISOString(),
            message: `[ProxyServer] ${message}`
        };
        
        this.debugLogs.push(entry);
        
        if (this.debugLogs.length > this.maxDebugLogs) {
            this.debugLogs.shift();
        }
        
        console.log(entry.message);
        this.emit('debug-log-added', entry);
    }

    public getDebugLogs(): Array<{timestamp: string, message: string}> {
        return [...this.debugLogs];
    }

    public getLogs(): ProxyLogEntry[] {
        return [...this.logs];
    }

    public clearLogs(): void {
        this.logs = [];
        this.emit('logs-cleared');
    }

    public clearDebugLogs(): void {
        this.debugLogs = [];
        this.addDebugLog('Debug logs cleared');
    }

    public addLogEntry(entry: ProxyLogEntry): void {
        this.logs.push(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.emit('log-added', entry);
    }

    public generateLogId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}
