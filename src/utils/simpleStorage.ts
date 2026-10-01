export type StorageEntryType = 'array' | 'dictionary' | 'variable' | 'image' | 'document';
export type StorageAction = 'set' | 'get' | 'append' | 'merge' | 'delete' | 'clear' | 'list';
export type StorageScope = 'workflow' | 'persistent';

export interface StorageImageEntry {
  url: string;
  dataUrl?: string;
  caption?: string;
  label?: string;
  timestamp?: number;
  width?: number;
  height?: number;
}

export interface StorageDocumentEntry {
  content: string;
  format?: 'markdown' | 'html' | 'text' | 'pdf';
  title?: string;
  timestamp?: number;
  dataUrl?: string;
}

export interface StorageItem<T = any> {
  key: string;
  type: StorageEntryType;
  value: T;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface SimpleStorageOptions {
  action: StorageAction;
  key?: string;
  type?: StorageEntryType; // default: 'variable'
  value?: any;
  scope?: StorageScope; // default: 'workflow'
  outputVariable?: string; // default: 'storageResult'
  deepMerge?: boolean; // For 'merge' action on dictionary
}

export interface SimpleStorageResult {
  success: boolean;
  action: StorageAction;
  key?: string;
  value?: any;
  itemCount?: number;
  keys?: string[];
  scope: StorageScope;
  summary: string;
}

/**
 * Global In-Memory Workflow Storage instance (lives during workflow session)
 */
class WorkflowMemoryStore {
  private store = new Map<string, StorageItem>();

  get(key: string): StorageItem | undefined {
    return this.store.get(key);
  }

  set(key: string, item: StorageItem) {
    this.store.set(key, item);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  entries(): [string, StorageItem][] {
    return Array.from(this.store.entries());
  }

  getAllValues(): Record<string, any> {
    const res: Record<string, any> = {};
    for (const [k, v] of this.store.entries()) {
      res[k] = v.value;
    }
    return res;
  }
}

export const globalWorkflowStore = new WorkflowMemoryStore();

/**
 * Accesses persistent storage (chrome.storage.local or localStorage)
 */
async function getPersistentStore(): Promise<Record<string, StorageItem>> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['autoflow_simple_storage'], (res) => {
        resolve(res?.autoflow_simple_storage || {});
      });
    });
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('autoflow_simple_storage');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  return {};
}

async function savePersistentStore(store: Record<string, StorageItem>): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ autoflow_simple_storage: store }, () => resolve());
    });
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('autoflow_simple_storage', JSON.stringify(store));
    } catch {}
  }
}

/**
 * Safe loose JSON parser that parses:
 * 1. Standard JSON: ["a", "b", "c"]
 * 2. Single-quoted JS literals: ['a', 'b', 'c']
 * 3. Trailing commas: ['a', 'b', 'c',]
 * 4. Dictionary objects: {'name': 'Alice', 'role': 'Admin'}
 */
export function parseLooseJson(val: string): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (!trimmed) return undefined;

  // 1. Try standard JSON.parse first
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. If it starts with [ or {, normalize single quotes to double quotes
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let escaped = false;
      let result = '';

      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];

        if (escaped) {
          result += char;
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          result += char;
          continue;
        }

        if (char === "'" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
          result += '"';
          continue;
        }

        if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
          result += '"';
          continue;
        }

        // Inside a single-quoted string being converted to double quote,
        // escape any unescaped double quotes
        if (inSingleQuote && char === '"') {
          result += '\\"';
          continue;
        }

        result += char;
      }

      // Remove trailing commas before closing ] or }
      const cleaned = result.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(cleaned);
    } catch {}
  }

  return undefined;
}

/**
 * Normalizes input value based on requested entry type
 */
export function formatValueForType(val: any, type: StorageEntryType): any {
  if (val === undefined || val === null) {
    if (type === 'array') return [];
    if (type === 'dictionary') return {};
    return '';
  }

  switch (type) {
    case 'array': {
      if (Array.isArray(val)) return [...val];
      if (typeof val === 'string') {
        const parsed = parseLooseJson(val);
        if (Array.isArray(parsed)) return parsed;
      }
      return [val];
    }
    case 'dictionary': {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        return { ...val };
      }
      if (typeof val === 'string') {
        const parsed = parseLooseJson(val);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed;
        }
      }
      return { value: val };
    }
    case 'image': {
      if (typeof val === 'string') {
        return { url: val, timestamp: Date.now() };
      }
      if (typeof val === 'object' && val !== null) {
        return {
          url: val.url || val.dataUrl || val.src || '',
          dataUrl: val.dataUrl,
          caption: val.caption,
          label: val.label,
          timestamp: val.timestamp || Date.now(),
        };
      }
      return { url: '', timestamp: Date.now() };
    }
    case 'document': {
      if (typeof val === 'string') {
        return { content: val, format: 'text', timestamp: Date.now() };
      }
      if (typeof val === 'object' && val !== null) {
        return {
          content: val.content || val.html || val.text || JSON.stringify(val),
          format: val.format || 'text',
          title: val.title,
          dataUrl: val.dataUrl,
          timestamp: val.timestamp || Date.now(),
        };
      }
      return { content: String(val), format: 'text', timestamp: Date.now() };
    }
    case 'variable':
    default:
      return val;
  }
}

/**
 * Executes a Simple Storage action
 */
export async function executeStorageAction(
  options: SimpleStorageOptions
): Promise<SimpleStorageResult> {
  const {
    action = 'get',
    key = '',
    type = 'variable',
    value,
    scope = 'workflow',
    deepMerge = true,
  } = options;

  const isPersistent = scope === 'persistent';
  const cleanKey = key.trim();

  if (action === 'clear') {
    if (isPersistent) {
      await savePersistentStore({});
    } else {
      globalWorkflowStore.clear();
    }
    return {
      success: true,
      action: 'clear',
      scope,
      summary: `Cleared all entries in ${scope} storage`,
      itemCount: 0,
      keys: [],
    };
  }

  if (action === 'list') {
    let keys: string[] = [];
    let allVals: Record<string, any> = {};

    if (isPersistent) {
      const pStore = await getPersistentStore();
      keys = Object.keys(pStore);
      for (const [k, v] of Object.entries(pStore)) {
        allVals[k] = v.value;
      }
    } else {
      keys = globalWorkflowStore.keys();
      allVals = globalWorkflowStore.getAllValues();
    }

    return {
      success: true,
      action: 'list',
      scope,
      keys,
      value: allVals,
      itemCount: keys.length,
      summary: `Retrieved ${keys.length} keys from ${scope} storage`,
    };
  }

  if (!cleanKey) {
    throw new Error(`Simple Storage action "${action}" requires a valid key.`);
  }

  // Get current item
  let existingItem: StorageItem | undefined;
  if (isPersistent) {
    const pStore = await getPersistentStore();
    existingItem = pStore[cleanKey];
  } else {
    existingItem = globalWorkflowStore.get(cleanKey);
  }

  if (action === 'delete') {
    let deleted = false;
    if (isPersistent) {
      const pStore = await getPersistentStore();
      if (cleanKey in pStore) {
        delete pStore[cleanKey];
        await savePersistentStore(pStore);
        deleted = true;
      }
    } else {
      deleted = globalWorkflowStore.delete(cleanKey);
    }

    return {
      success: true,
      action: 'delete',
      key: cleanKey,
      scope,
      summary: deleted ? `Deleted "${cleanKey}" from ${scope} storage` : `Key "${cleanKey}" did not exist in ${scope} storage`,
    };
  }

  if (action === 'get') {
    const resolvedVal = existingItem ? existingItem.value : undefined;
    return {
      success: true,
      action: 'get',
      key: cleanKey,
      value: resolvedVal,
      scope,
      summary: existingItem
        ? `Retrieved "${cleanKey}" (${existingItem.type}) from ${scope} storage`
        : `Key "${cleanKey}" not found in ${scope} storage (returned undefined)`,
    };
  }

  // Write Actions: 'set', 'append', 'merge'
  const formattedVal = formatValueForType(value, type);
  let finalVal = formattedVal;

  if (action === 'append') {
    if (type === 'array') {
      const prevArray = existingItem && Array.isArray(existingItem.value) ? existingItem.value : [];
      const toAppend = Array.isArray(formattedVal) ? formattedVal : [formattedVal];
      finalVal = [...prevArray, ...toAppend];
    } else if (type === 'document') {
      const prevContent = existingItem?.value?.content || '';
      const newContent = formattedVal?.content || String(formattedVal);
      finalVal = {
        content: prevContent ? `${prevContent}\n\n${newContent}` : newContent,
        format: formattedVal?.format || existingItem?.value?.format || 'text',
        title: formattedVal?.title || existingItem?.value?.title,
        timestamp: Date.now(),
      };
    } else if (type === 'dictionary') {
      const prevDict = existingItem && typeof existingItem.value === 'object' ? existingItem.value : {};
      finalVal = { ...prevDict, ...(typeof formattedVal === 'object' ? formattedVal : { value: formattedVal }) };
    } else {
      // Primitive variable: string concatenation with space/newline
      const prevStr = existingItem?.value !== undefined ? String(existingItem.value) : '';
      finalVal = prevStr ? `${prevStr}\n${formattedVal}` : String(formattedVal);
    }
  } else if (action === 'merge') {
    const prevDict = existingItem && typeof existingItem.value === 'object' ? existingItem.value : {};
    const incDict = typeof formattedVal === 'object' && formattedVal !== null ? formattedVal : { value: formattedVal };
    finalVal = deepMerge ? deepMergeObjects(prevDict, incDict) : { ...prevDict, ...incDict };
  }

  const newItem: StorageItem = {
    key: cleanKey,
    type,
    value: finalVal,
    timestamp: Date.now(),
  };

  if (isPersistent) {
    const pStore = await getPersistentStore();
    pStore[cleanKey] = newItem;
    await savePersistentStore(pStore);
  } else {
    globalWorkflowStore.set(cleanKey, newItem);
  }

  return {
    success: true,
    action,
    key: cleanKey,
    value: finalVal,
    scope,
    summary: `Saved ${type} to "${cleanKey}" in ${scope} storage (${action})`,
  };
}

function deepMergeObjects(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return source;

  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && typeof result[key] === 'object' && result[key] !== null) {
      result[key] = deepMergeObjects(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Synchronizes Simple Storage entries into ExecutionContext variables
 * so ANY node can access them directly as {{storage.key}} or {{key}}
 */
export function syncStorageToVariables(variables: Record<string, any>): void {
  if (!variables) return;
  const storageMap: Record<string, any> = {};

  for (const [key, item] of globalWorkflowStore.entries()) {
    storageMap[key] = item.value;
    // Direct access if key not already occupied
    if (!(key in variables)) {
      variables[key] = item.value;
    }
    // Prefixed access (always guaranteed)
    variables[`storage.${key}`] = item.value;
    variables[`storage_${key}`] = item.value;
  }

  variables.__storage = storageMap;
  variables.storage = storageMap;
}
