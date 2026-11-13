import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME = os.homedir();
export const CAREER_OPS = process.env.CAREER_OPS_DIR || path.join(HOME, 'Developer/career-ops');
export const DOCS_ROOT = path.join(HOME, 'Developer/Andy AI');
export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(APP_DIR, 'public');
export const STORE_FILE = process.env.JOBHQ_STORE || path.join(APP_DIR, 'data/store.json');
export const PORT = Number(process.env.PORT || 4747);
export const HOST = '127.0.0.1';

// Fallback rates (IDR per 1 unit) used only if the live lookup fails.
export const FALLBACK_IDR = { USD: 18132, SGD: 14000, EUR: 19800, GBP: 23000, AUD: 11800, CAD: 13000, MYR: 4100, IDR: 1 };
