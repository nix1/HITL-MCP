import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// File logging utility
export class DebugLogger {
  private logPath: string = '';
  private logStream: fs.WriteStream | null = null;
  private logBuffer: string[] = [];
  private loggingEnabled: boolean;
  private loggingLevel: string;

  constructor(workspaceRoot?: string) {
    // Check environment variables for logging configuration
    this.loggingEnabled = process.env.HUMANAGENT_LOGGING_ENABLED === 'true' || true; // Enable by default for debugging
    this.loggingLevel = process.env.HUMANAGENT_LOGGING_LEVEL || 'DEBUG'; // Debug level by default
    
    try {
      // Always log to system temp directory - server is workspace-independent
      const tempDir = os.tmpdir();
      this.logPath = path.join(tempDir, 'HITL-server.log');
      
      console.log(`[LOGGER] Attempting to create log file at: ${this.logPath}`);
      
      // Clear previous log file on each startup
      if (fs.existsSync(this.logPath)) {
        fs.unlinkSync(this.logPath);
      }
      
      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
      this.logStream.on('error', (error) => {
        console.error(`[LOGGER] File stream error:`, error);
      });
      
      this.log('DEBUG', `Debug logging started at ${new Date().toISOString()}`);
      this.log('DEBUG', `Current system time: ${new Date()}`);
      this.log('DEBUG', `Log file: ${this.logPath}`);
      this.log('DEBUG', `Working directory: ${process.cwd()}`);
      this.log('DEBUG', `Logging level set to: ${this.loggingLevel}`);
      console.log(`[LOGGER] Debug logger initialized successfully at: ${this.logPath}`);
    } catch (error) {
      console.error(`[LOGGER] Failed to initialize debug logger:`, error);
      this.logStream = null;
    }
  }

  log(level: string, message: string, data?: any): void {
    // Skip logging if disabled
    if (!this.loggingEnabled) {
      return;
    }
    
    // Basic level filtering (ERROR > WARN > INFO > DEBUG)
    const levelPriority: Record<string, number> = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, SSE: 2, TEST: 3 };
    const currentLevelPriority = levelPriority[this.loggingLevel] ?? 2;
    const messageLevelPriority = levelPriority[level] ?? 2;
    
    if (messageLevelPriority > currentLevelPriority) {
      return;
    }
    
    const now = new Date();
    const timestamp = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getMilliseconds()).padStart(3, '0');
    const logLine = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
    
    // Write to file if stream is available
    if (this.logStream) {
      try {
        this.logStream.write(logLine);
      } catch (error) {
        // Don't use console.log here to avoid recursion - write error directly
        process.stderr.write(`[LOGGER] Error writing to log file: ${error}\n`);
      }
    } else {
      // Buffer logs if stream not available
      this.logBuffer.push(logLine);
    }
  }

  close(): void {
    try {
      this.log('DEBUG', 'Closing debug logger');
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
    } catch (error) {
      console.error(`[LOGGER] Error closing debug logger:`, error);
    }
  }
}
