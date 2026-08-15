import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');

export function loadLocalEnv(): string[] {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(PACKAGE_ROOT, '.env'),
  ];
  const loaded: string[] = [];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
    loaded.push(file);
  }

  return loaded;
}

export function resolveEnvConfig<T extends { appKey: string; appSecret: string; token?: string; cwd: string }>(config: T): T {
  return {
    ...config,
    appKey: config.appKey || process.env.YUANBAO_APP_KEY || '',
    appSecret: config.appSecret || process.env.YUANBAO_APP_SECRET || '',
    token: config.token || process.env.YUANBAO_TOKEN || undefined,
    cwd: config.cwd || process.env.DSH_YUANBAO_CWD || process.cwd(),
  };
}
