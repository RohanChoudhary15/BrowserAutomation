import { db } from './db';
import { generateId } from '../utils/id';

export type MessagingPlatform = 'telegram' | 'discord' | 'slack';

export interface BotCredential {
  id: string;
  platform: MessagingPlatform;
  name: string; // User-friendly label (e.g., "Work Slack", "Personal Telegram")
  // Telegram fields
  botToken?: string;
  defaultChatId?: string;
  // Discord fields
  mode?: 'webhook' | 'bot';
  webhookUrl?: string;
  channelId?: string;
  username?: string;
  avatarUrl?: string;
  // Slack fields
  channel?: string;
  iconEmoji?: string;
  // Metadata
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'autoflow_bot_credentials';

// In-memory cache for fast synchronous access and testing
let credentialsCache: BotCredential[] = [];
let isLoaded = false;

/**
 * Load all credentials from IndexedDB, chrome.storage.local, or localStorage
 */
export async function loadCredentials(): Promise<BotCredential[]> {
  try {
    // 1. Try chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get([STORAGE_KEY]);
      if (res && Array.isArray(res[STORAGE_KEY])) {
        credentialsCache = res[STORAGE_KEY];
        isLoaded = true;
        return credentialsCache;
      }
    }

    // 2. Try IndexedDB settings store
    const dbValue = await db.getSetting(STORAGE_KEY);
    if (Array.isArray(dbValue)) {
      credentialsCache = dbValue;
      isLoaded = true;
      return credentialsCache;
    }

    // 3. Try window.localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        credentialsCache = JSON.parse(raw);
        isLoaded = true;
        return credentialsCache;
      }
    }
  } catch (err) {
    console.warn('[AutoFlow] Error loading bot credentials:', err);
  }

  isLoaded = true;
  return credentialsCache;
}

/**
 * Persist all credentials across all available storage engines
 */
async function persistAll(credentials: BotCredential[]): Promise<void> {
  credentialsCache = credentials;

  // 1. IndexedDB
  try {
    await db.setSetting(STORAGE_KEY, credentials);
  } catch {}

  // 2. chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: credentials });
    } catch {}
  }

  // 3. window.localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    } catch {}
  }
}

/**
 * Save (create or update) a bot credential
 */
export async function saveCredential(
  cred: Partial<BotCredential> & { platform: MessagingPlatform; name: string }
): Promise<BotCredential> {
  await loadCredentials();

  const now = Date.now();
  const id = cred.id || generateId('cred');

  const existingIndex = credentialsCache.findIndex((c) => c.id === id);

  const newCredential: BotCredential = {
    id,
    platform: cred.platform,
    name: cred.name.trim() || `${cred.platform.toUpperCase()} Account`,
    botToken: cred.botToken?.trim(),
    defaultChatId: cred.defaultChatId?.trim(),
    mode: cred.mode || 'webhook',
    webhookUrl: cred.webhookUrl?.trim(),
    channelId: cred.channelId?.trim(),
    username: cred.username?.trim(),
    avatarUrl: cred.avatarUrl?.trim(),
    channel: cred.channel?.trim(),
    iconEmoji: cred.iconEmoji?.trim(),
    createdAt: existingIndex >= 0 ? credentialsCache[existingIndex].createdAt : now,
    updatedAt: now,
  };

  let updatedList: BotCredential[];
  if (existingIndex >= 0) {
    updatedList = [...credentialsCache];
    updatedList[existingIndex] = newCredential;
  } else {
    updatedList = [...credentialsCache, newCredential];
  }

  await persistAll(updatedList);
  return newCredential;
}

/**
 * Delete a credential by ID
 */
export async function deleteCredential(id: string): Promise<void> {
  await loadCredentials();
  const filtered = credentialsCache.filter((c) => c.id !== id);
  await persistAll(filtered);
}

/**
 * Get credentials filtered by platform
 */
export async function getCredentialsByPlatform(platform: MessagingPlatform): Promise<BotCredential[]> {
  await loadCredentials();
  return credentialsCache.filter((c) => c.platform === platform);
}

/**
 * Get a single credential by ID
 */
export async function getCredentialById(id: string): Promise<BotCredential | undefined> {
  await loadCredentials();
  return credentialsCache.find((c) => c.id === id);
}

/**
 * Synchronous getter from in-memory cache
 */
export function getCachedCredentials(platform?: MessagingPlatform): BotCredential[] {
  if (platform) {
    return credentialsCache.filter((c) => c.platform === platform);
  }
  return credentialsCache;
}
