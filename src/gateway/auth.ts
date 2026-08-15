import { createHmac, randomBytes } from 'node:crypto';
import type { Logger, ResolvedYuanbaoAccount } from '../types.js';

export type SignTokenData = {
  bot_id: string;
  duration: number;
  product: string;
  source: string;
  token: string;
};

const SIGN_TOKEN_PATH = '/api/v5/robotLogic/sign-token';
const RETRYABLE_SIGN_CODE = 10099;
const SIGN_MAX_RETRIES = 3;
const SIGN_RETRY_DELAY_MS = 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const cache = new Map<string, { data: SignTokenData; expiresAt: number }>();
const inflight = new Map<string, Promise<SignTokenData>>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function timestampInBeijing(): string {
  return new Date(Date.now() + 8 * 3600000)
    .toISOString()
    .replace('Z', '+08:00')
    .replace(/\.\d{3}/, '');
}

export function computeSignature(params: {
  nonce: string;
  timestamp: string;
  appKey: string;
  appSecret: string;
}): string {
  const plain = params.nonce + params.timestamp + params.appKey + params.appSecret;
  return createHmac('sha256', params.appSecret).update(plain).digest('hex');
}

async function fetchSignToken(account: ResolvedYuanbaoAccount, logger?: Logger): Promise<SignTokenData> {
  if (!account.appKey || !account.appSecret) {
    throw new Error('missing Yuanbao appKey or appSecret');
  }

  const url = `https://${account.apiDomain}${SIGN_TOKEN_PATH}`;
  for (let attempt = 0; attempt <= SIGN_MAX_RETRIES; attempt++) {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = timestampInBeijing();
    const signature = computeSignature({ nonce, timestamp, appKey: account.appKey, appSecret: account.appSecret });
    const body = { app_key: account.appKey, nonce, signature, timestamp };

    logger?.info(`signing Yuanbao token: ${url}${attempt > 0 ? ` retry=${attempt}` : ''}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AppVersion': 'dsh-yuanbao',
        'X-OperationSystem': process.platform,
        'X-Instance-Id': '16',
        'X-Bot-Version': 'dsh-yuanbao',
        ...(account.routeEnv ? { 'x-route-env': account.routeEnv } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`sign-token HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { code: number; data?: SignTokenData; msg?: string };
    if (result.code === 0 && result.data) {
      logger?.info(`Yuanbao token signed: bot_id=${result.data.bot_id}`);
      return result.data;
    }

    if (result.code === RETRYABLE_SIGN_CODE && attempt < SIGN_MAX_RETRIES) {
      await sleep(SIGN_RETRY_DELAY_MS);
      continue;
    }

    throw new Error(`sign-token error: code=${result.code}, msg=${result.msg ?? ''}`);
  }

  throw new Error('sign-token failed: max retries exceeded');
}

export async function getSignToken(account: ResolvedYuanbaoAccount, logger?: Logger): Promise<SignTokenData> {
  if (account.token) {
    return {
      bot_id: account.botId ?? '',
      duration: 0,
      product: 'yuanbao',
      source: 'bot',
      token: account.token,
    };
  }

  const cached = cache.get(account.accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = inflight.get(account.accountId);
  if (existing) return existing;

  const promise = fetchSignToken(account, logger).then(data => {
    const expiresAt = Date.now() + Math.max(60_000, data.duration * 1000 - REFRESH_MARGIN_MS);
    cache.set(account.accountId, { data, expiresAt });
    if (data.bot_id) account.botId = data.bot_id;
    return data;
  }).finally(() => {
    inflight.delete(account.accountId);
  });

  inflight.set(account.accountId, promise);
  return promise;
}

export function clearTokenCache(accountId?: string): void {
  if (accountId) {
    cache.delete(accountId);
    inflight.delete(accountId);
    return;
  }
  cache.clear();
  inflight.clear();
}
