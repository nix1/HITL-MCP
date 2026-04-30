import * as fs from 'fs';
import * as path from 'path';
import { Memento } from './types';

/**
 * Simple file-based storage that mimics VS Code Memento interface
 * Used by standalone server when VS Code Memento is not available
 */
export class FileBasedStorage implements Memento {
  private storageFile: string;
  private data: Record<string, any> = {};

  constructor(storagePath: string) {
    this.storageFile = path.join(storagePath, 'mcp-global-storage.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const content = fs.readFileSync(this.storageFile, 'utf8');
        this.data = JSON.parse(content);
      }
    } catch (error) {
      console.error('[FileBasedStorage] Failed to load storage:', error);
      this.data = {};
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('[FileBasedStorage] Failed to save storage:', error);
    }
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.data[key];
    return value !== undefined ? value : defaultValue;
  }

  update(key: string, value: any): Promise<void> {
    this.data[key] = value;
    this.save();
    return Promise.resolve();
  }
}
