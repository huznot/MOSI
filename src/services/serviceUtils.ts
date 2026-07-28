import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';

import { REFRESH_RETRY_DELAY_MS } from '../constants/config';
import { CachedServiceResponse } from '../types/alerts';

class ServiceError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
  }
}

export function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function cleanText(input: string) {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function readCache<T>(key: string) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CachedServiceResponse<T>;
  } catch {
    return null;
  }
}

export async function readFreshCache<T>(key: string, ttlMs: number) {
  const cached = await readCache<T>(key);

  if (!cached) {
    return null;
  }

  const cachedDate = new Date(cached.cachedAt).getTime();
  const ageMs = Date.now() - cachedDate;

  if (!Number.isFinite(cachedDate) || !Number.isFinite(ageMs) || ageMs > ttlMs) {
    return null;
  }

  return cached;
}

export async function writeCache<T>(key: string, data: T) {
  try {
    const payload: CachedServiceResponse<T> = {
      data,
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {

  }
}

export async function fetchText(url: string) {
  try {
    const response = await expoFetch(url, {
      headers: {
        'User-Agent': 'MOSI/1.0',
        Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new ServiceError(`Request failed with HTTP ${response.status}.`, response.status);
    }

    return response.text();
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError('Network request failed.');
  }
}

export async function fetchJson<T>(url: string) {
  try {
    const response = await expoFetch(url, {
      headers: {
        'User-Agent': 'MOSI/1.0',
        Accept: 'application/json,text/plain,*/*',
      },
    });

    if (!response.ok) {
      throw new ServiceError(`Request failed with HTTP ${response.status}.`, response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError('Network request failed.');
  }
}

export async function postJson<T>(url: string, body: string, contentType = 'text/plain') {
  try {
    const response = await expoFetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'MOSI/1.0',
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': contentType,
      },
      body,
    });

    if (!response.ok) {
      throw new ServiceError(`Request failed with HTTP ${response.status}.`, response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError('Network request failed.');
  }
}

export async function withRetry<T>(serviceName: string, fetcher: () => Promise<T>) {
  try {
    return await fetcher();
  } catch {
    await wait(REFRESH_RETRY_DELAY_MS);

    try {
      return await fetcher();
    } catch {
      throw new ServiceError(`${serviceName} is temporarily unavailable.`);
    }
  }
}

export async function withCacheFallback<T>(serviceName: string, key: string, fetcher: () => Promise<T>) {
  try {
    const data = await withRetry(serviceName, fetcher);
    await writeCache(key, data);
    return { data, fromCache: false };
  } catch (error) {
    const cached = await readCache<T>(key);
    if (cached) {
      return { data: cached.data, fromCache: true };
    }

    if (error instanceof ServiceError) {
      throw error;
    }

    throw new ServiceError(`${serviceName} is temporarily unavailable.`);
  }
}

export function firstMatch(text: string, expression: RegExp) {
  return text.match(expression)?.[1] ?? null;
}
