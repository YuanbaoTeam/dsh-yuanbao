import { readFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '../..');
const TERMINAL_TYPE_ID = '16';

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function buildDeviceInfo(): {
  appVersion: string;
  appOperationSystem: string;
  botVersion: string;
  instanceId: string;
} {
  const version = readPackageVersion();
  return {
    appVersion: version,
    appOperationSystem: os.type(),
    botVersion: version,
    instanceId: TERMINAL_TYPE_ID,
  };
}

export function buildUserAgent(): string {
  return `dsh-yuanbao/${readPackageVersion()} (Node/${process.versions.node}; ${os.platform()})`;
}
