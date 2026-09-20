/**
 * Permanent Site Memory & Notes Store for AutoFlow AI Agent
 * 
 * Stores domain-specific knowledge, UI quirks, selectors, and execution notes
 * that the AI Agent autonomously reads, writes, and updates across web visits.
 */

export interface SiteNote {
  id: string;
  domain: string;
  title?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'agent' | 'user';
  tags?: string[];
}

export const SITE_MEMORY_STORAGE_KEY = 'autoflow_site_memory_v1';

/**
 * Normalizes full URLs, hostnames, and IP addresses to clean domain keys
 * e.g., "https://github.com/trending?since=daily" -> "github.com"
 */
export function normalizeDomain(input: string): string {
  if (!input || typeof input !== 'string') return 'global';
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === 'global') return 'global';

  try {
    let urlStr = trimmed;
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = `https://${urlStr}`;
    }
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return host || 'global';
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0].split('?')[0] || 'global';
  }
}

/**
 * Loads the raw memory map from Chrome Storage or localStorage
 */
async function loadRawMemoryMap(): Promise<Record<string, SiteNote[]>> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([SITE_MEMORY_STORAGE_KEY], (result) => {
        resolve(result[SITE_MEMORY_STORAGE_KEY] || {});
      });
    });
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const data = localStorage.getItem(SITE_MEMORY_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Saves the raw memory map to Chrome Storage or localStorage
 */
async function saveRawMemoryMap(map: Record<string, SiteNote[]>): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SITE_MEMORY_STORAGE_KEY]: map }, () => {
        resolve();
      });
    });
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SITE_MEMORY_STORAGE_KEY, JSON.stringify(map));
    } catch (err) {
      console.warn('Could not persist site memory to localStorage:', err);
    }
  }
}

/**
 * Retrieves all notes for a specific website domain plus global notes
 */
export async function getSiteNotes(domainOrUrl: string): Promise<SiteNote[]> {
  const domain = normalizeDomain(domainOrUrl);
  const map = await loadRawMemoryMap();

  const domainNotes = map[domain] || [];
  const globalNotes = domain !== 'global' ? (map['global'] || []) : [];

  return [...domainNotes, ...globalNotes];
}

/**
 * Retrieves all saved notes across all domains
 */
export async function getAllSiteNotes(): Promise<Record<string, SiteNote[]>> {
  return await loadRawMemoryMap();
}

/**
 * Saves or updates a memory note for a domain
 */
export async function saveSiteNote(
  domainOrUrl: string,
  content: string,
  source: 'agent' | 'user' = 'agent',
  title?: string
): Promise<SiteNote> {
  const domain = normalizeDomain(domainOrUrl);
  const map = await loadRawMemoryMap();
  const notes = map[domain] || [];

  const cleanContent = content.trim();
  const now = Date.now();

  // Check if a note with identical or highly similar content already exists
  const existingIndex = notes.findIndex(
    (n) => n.content.toLowerCase().trim() === cleanContent.toLowerCase()
  );

  let savedNote: SiteNote;

  if (existingIndex >= 0) {
    savedNote = {
      ...notes[existingIndex],
      updatedAt: now,
      content: cleanContent,
      title: title || notes[existingIndex].title,
    };
    notes[existingIndex] = savedNote;
  } else {
    savedNote = {
      id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
      domain,
      title: title || (cleanContent.length > 40 ? `${cleanContent.slice(0, 37)}...` : cleanContent),
      content: cleanContent,
      createdAt: now,
      updatedAt: now,
      source,
    };
    notes.unshift(savedNote);
  }

  map[domain] = notes;
  await saveRawMemoryMap(map);
  return savedNote;
}

/**
 * Updates an existing note by ID
 */
export async function updateSiteNote(
  id: string,
  newContent: string,
  newTitle?: string
): Promise<SiteNote | null> {
  const map = await loadRawMemoryMap();

  for (const domain of Object.keys(map)) {
    const list = map[domain];
    const idx = list.findIndex((n) => n.id === id);
    if (idx !== -1) {
      const updated: SiteNote = {
        ...list[idx],
        content: newContent.trim(),
        title: newTitle !== undefined ? newTitle.trim() : list[idx].title,
        updatedAt: Date.now(),
      };
      list[idx] = updated;
      map[domain] = list;
      await saveRawMemoryMap(map);
      return updated;
    }
  }

  return null;
}

/**
 * Deletes a note by ID
 */
export async function deleteSiteNote(id: string): Promise<boolean> {
  const map = await loadRawMemoryMap();
  let deleted = false;

  for (const domain of Object.keys(map)) {
    const list = map[domain];
    const initialLen = list.length;
    map[domain] = list.filter((n) => n.id !== id);
    if (map[domain].length < initialLen) {
      deleted = true;
      if (map[domain].length === 0) {
        delete map[domain];
      }
    }
  }

  if (deleted) {
    await saveRawMemoryMap(map);
  }

  return deleted;
}

/**
 * Clears all notes for a specific domain
 */
export async function clearDomainNotes(domainOrUrl: string): Promise<void> {
  const domain = normalizeDomain(domainOrUrl);
  const map = await loadRawMemoryMap();
  delete map[domain];
  await saveRawMemoryMap(map);
}
