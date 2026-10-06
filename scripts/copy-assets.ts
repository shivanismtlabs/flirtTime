import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const assetsFrom = join(root, 'src', 'assets');
const assetsTo = join(root, 'dist', 'assets');
mkdirSync(assetsTo, { recursive: true });
cpSync(assetsFrom, assetsTo, { recursive: true });
console.log(`Copied assets → ${assetsTo}`);

const consoleFrom = join(root, 'src', 'apps', 'socket', 'console');
const consoleTo = join(root, 'dist', 'apps', 'socket', 'console');
mkdirSync(consoleTo, { recursive: true });
cpSync(consoleFrom, consoleTo, { recursive: true });
console.log(`Copied socket console → ${consoleTo}`);
