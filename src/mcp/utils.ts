import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Version injected by webpack DefinePlugin at build time
declare const __PACKAGE_VERSION__: string;
export const VERSION = typeof __PACKAGE_VERSION__ !== 'undefined' ? __PACKAGE_VERSION__ : '1.0.4';
