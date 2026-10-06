import { db } from './db';
import { generateId } from '../utils/id';

export interface CardSchemaField {
  name: string;
  selector?: string;
  attribute?: string;
}

export interface CardSchemaPreset {
  id: string;
  name: string;
  containerSelector: string; // Parent div / card container selector
  fields: CardSchemaField[];
  isBuiltIn?: boolean;
  category?: 'ecommerce' | 'articles' | 'jobs' | 'github' | 'real_estate' | 'social' | 'custom';
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export const BUILTIN_CARD_SCHEMAS: CardSchemaPreset[] = [
  {
    id: 'builtin_ecommerce',
    name: 'E-Commerce Products',
    containerSelector: '.product-card, article, [class*="product-card" i], [class*="product-item" i]',
    isBuiltIn: true,
    category: 'ecommerce',
    description: 'Standard product cards with title, price, image, link, and description',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'title', selector: 'h2, h3, h4, .title, [class*="title" i], [class*="name" i]', attribute: 'text' },
      { name: 'price', selector: '.price, [class*="price" i], .amount, [class*="amount" i], [data-price]', attribute: 'text' },
      { name: 'image', selector: 'img, picture source, [class*="image" i] img', attribute: 'src' },
      { name: 'link', selector: 'a[href], a', attribute: 'href' },
      { name: 'description', selector: 'p, .description, [class*="desc" i], [class*="summary" i]', attribute: 'paragraphs' },
    ],
  },
  {
    id: 'builtin_amazon',
    name: 'Amazon Products',
    containerSelector: '.s-result-item[data-asin], [data-component-type="s-search-result"], .s-card-container',
    isBuiltIn: true,
    category: 'ecommerce',
    description: 'Amazon search results with title, price, image, product link, rating, and review count',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'title', selector: 'h2 a span, h2 span, .a-size-medium, .a-size-base-plus, [class*="title" i]', attribute: 'text' },
      { name: 'price', selector: '.a-price .a-offscreen, .a-price, [class*="price" i]', attribute: 'text' },
      { name: 'image', selector: 'img.s-image, img', attribute: 'src' },
      { name: 'link', selector: 'h2 a.a-link-normal, a.a-link-normal[href*="/dp/"]', attribute: 'href' },
      { name: 'rating', selector: 'i[class*="a-star"] span, span.a-icon-alt', attribute: 'text' },
      { name: 'reviews', selector: 'span.a-size-base.s-underline-text, a[href*="customerReviews"]', attribute: 'text' },
    ],
  },
  {
    id: 'builtin_ebay',
    name: 'eBay Item Listings',
    containerSelector: '.s-item, li.s-item',
    isBuiltIn: true,
    category: 'ecommerce',
    description: 'eBay listings with title, price, image, item URL, and shipping details',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'title', selector: '.s-item__title, h3, .s-item__link', attribute: 'text' },
      { name: 'price', selector: '.s-item__price, [class*="price" i]', attribute: 'text' },
      { name: 'image', selector: '.s-item__image-img, img', attribute: 'src' },
      { name: 'link', selector: '.s-item__link, a', attribute: 'href' },
      { name: 'shipping', selector: '.s-item__shipping, .s-item__logisticsCost', attribute: 'text' },
    ],
  },
  {
    id: 'builtin_github',
    name: 'GitHub Repositories',
    containerSelector: 'article.Box-row, .Box-row, li.Box-row',
    isBuiltIn: true,
    category: 'github',
    description: 'GitHub repositories with name, URL, description, programming language, stars, and forks',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'repo_name', selector: 'h1 a, h2 a, a.Link', attribute: 'text' },
      { name: 'repo_url', selector: 'h1 a, h2 a, a.Link', attribute: 'href' },
      { name: 'description', selector: 'p, [itemprop="description"]', attribute: 'text' },
      { name: 'language', selector: '[itemprop="programmingLanguage"], [class*="lang" i]', attribute: 'text' },
      { name: 'stars', selector: 'a[href*="stargazers"]', attribute: 'text' },
      { name: 'forks', selector: 'a[href*="forks"]', attribute: 'text' },
    ],
  },
  {
    id: 'builtin_articles',
    name: 'Articles & Blogs',
    containerSelector: 'article, .post, .article-card, [class*="article" i]',
    isBuiltIn: true,
    category: 'articles',
    description: 'News and blog articles with headline, author, date, paragraphs, image, and link',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'headline', selector: 'h1, h2, h3, h4, a[class*="title" i]', attribute: 'text' },
      { name: 'author', selector: '.author, [rel="author"], [class*="author" i]', attribute: 'text' },
      { name: 'date', selector: 'time, .date, [class*="date" i], [class*="time" i]', attribute: 'text' },
      { name: 'paragraphs', selector: 'p', attribute: 'paragraphs' },
      { name: 'image', selector: 'img, picture source', attribute: 'src' },
      { name: 'url', selector: 'a[href], a', attribute: 'href' },
    ],
  },
  {
    id: 'builtin_jobs',
    name: 'Job Listings',
    containerSelector: '.job-item, li.job, article, [class*="job" i]',
    isBuiltIn: true,
    category: 'jobs',
    description: 'Job postings with job title, company, location, application link, and details',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'job_title', selector: 'h2, h3, [class*="title" i]', attribute: 'text' },
      { name: 'company', selector: '[class*="company" i], [class*="employer" i]', attribute: 'text' },
      { name: 'location', selector: '[class*="location" i], [class*="city" i]', attribute: 'text' },
      { name: 'link', selector: 'a[href], a', attribute: 'href' },
      { name: 'description', selector: 'p, [class*="snippet" i], [class*="summary" i]', attribute: 'text' },
    ],
  },
  {
    id: 'builtin_real_estate',
    name: 'Real Estate Listings',
    containerSelector: '.property-card, .listing-card, [class*="property" i], [class*="listing" i]',
    isBuiltIn: true,
    category: 'real_estate',
    description: 'Real estate properties with address, price, beds, baths, image, and listing URL',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fields: [
      { name: 'address', selector: 'h2, h3, [class*="address" i]', attribute: 'text' },
      { name: 'price', selector: '[class*="price" i], .amount', attribute: 'text' },
      { name: 'beds', selector: '[class*="bed" i], [data-label="beds"]', attribute: 'text' },
      { name: 'baths', selector: '[class*="bath" i], [data-label="baths"]', attribute: 'text' },
      { name: 'image', selector: 'img', attribute: 'src' },
      { name: 'url', selector: 'a[href]', attribute: 'href' },
    ],
  },
];

const STORAGE_KEY = 'autoflow_custom_card_schemas';

let customSchemasCache: CardSchemaPreset[] = [];
let isLoaded = false;

/**
 * Load all custom saved schemas from chrome.storage.local, IndexedDB, or localStorage
 */
export async function loadCustomCardSchemas(): Promise<CardSchemaPreset[]> {
  try {
    // 1. Try chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get([STORAGE_KEY]);
      if (res && Array.isArray(res[STORAGE_KEY])) {
        customSchemasCache = res[STORAGE_KEY];
        isLoaded = true;
        return customSchemasCache;
      }
    }

    // 2. Try IndexedDB
    try {
      const dbValue = await db.getSetting(STORAGE_KEY);
      if (Array.isArray(dbValue)) {
        customSchemasCache = dbValue;
        isLoaded = true;
        return customSchemasCache;
      }
    } catch {}

    // 3. Fallback to localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        customSchemasCache = JSON.parse(stored);
        isLoaded = true;
        return customSchemasCache;
      }
    }
  } catch (err) {
    console.warn('[AutoFlow] Failed to load custom card schemas:', err);
  }

  isLoaded = true;
  return customSchemasCache;
}

/**
 * Get all available schemas: Built-in presets combined with user's saved schemas
 */
export async function getAllCardSchemas(): Promise<CardSchemaPreset[]> {
  const custom = await loadCustomCardSchemas();
  return [...BUILTIN_CARD_SCHEMAS, ...custom];
}

/**
 * Persist custom schemas to chrome.storage.local, IndexedDB, and localStorage
 */
async function persistCustomSchemas(schemas: CardSchemaPreset[]): Promise<void> {
  customSchemasCache = schemas;

  // 1. chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: schemas });
    } catch (e) {
      console.warn('[AutoFlow] Error persisting schemas to chrome.storage:', e);
    }
  }

  // 2. IndexedDB
  try {
    await db.setSetting(STORAGE_KEY, schemas);
  } catch {}

  // 3. localStorage fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schemas));
    } catch {}
  }
}

/**
 * Save a card schema along with its parent div (containerSelector) and fields
 */
export async function saveCardSchema(data: {
  id?: string;
  name: string;
  containerSelector: string;
  fields: CardSchemaField[];
  category?: CardSchemaPreset['category'];
  description?: string;
}): Promise<CardSchemaPreset> {
  const current = await loadCustomCardSchemas();
  const now = Date.now();

  const trimmedName = data.name.trim() || 'Custom Card Schema';
  const trimmedContainer = data.containerSelector.trim();
  const fields = Array.isArray(data.fields) ? data.fields : [];

  if (data.id) {
    const existingIndex = current.findIndex((s) => s.id === data.id);
    if (existingIndex !== -1) {
      const updated: CardSchemaPreset = {
        ...current[existingIndex],
        name: trimmedName,
        containerSelector: trimmedContainer,
        fields,
        category: data.category || current[existingIndex].category || 'custom',
        description: data.description ?? current[existingIndex].description,
        updatedAt: now,
      };
      current[existingIndex] = updated;
      await persistCustomSchemas(current);
      return updated;
    }
  }

  // Check if a schema with the same name already exists
  const duplicateIndex = current.findIndex((s) => s.name.toLowerCase() === trimmedName.toLowerCase());
  if (duplicateIndex !== -1) {
    const updated: CardSchemaPreset = {
      ...current[duplicateIndex],
      containerSelector: trimmedContainer,
      fields,
      category: data.category || current[duplicateIndex].category || 'custom',
      description: data.description ?? current[duplicateIndex].description,
      updatedAt: now,
    };
    current[duplicateIndex] = updated;
    await persistCustomSchemas(current);
    return updated;
  }

  const newSchema: CardSchemaPreset = {
    id: generateId('schema'),
    name: trimmedName,
    containerSelector: trimmedContainer,
    fields,
    isBuiltIn: false,
    category: data.category || 'custom',
    description: data.description || `Custom schema with ${fields.length} fields`,
    createdAt: now,
    updatedAt: now,
  };

  const updatedSchemas = [...current, newSchema];
  await persistCustomSchemas(updatedSchemas);
  return newSchema;
}

/**
 * Delete a custom card schema by ID
 */
export async function deleteCardSchema(id: string): Promise<boolean> {
  // Built-in schemas cannot be deleted
  if (BUILTIN_CARD_SCHEMAS.some((b) => b.id === id)) {
    return false;
  }
  const current = await loadCustomCardSchemas();
  const filtered = current.filter((s) => s.id !== id);
  if (filtered.length !== current.length) {
    await persistCustomSchemas(filtered);
    return true;
  }
  return false;
}

/**
 * Export all custom card schemas as a formatted JSON string
 */
export async function exportCardSchemasAsJson(): Promise<string> {
  const custom = await loadCustomCardSchemas();
  return JSON.stringify(custom, null, 2);
}

/**
 * Import card schemas from JSON string
 */
export async function importCardSchemasFromJson(jsonStr: string): Promise<CardSchemaPreset[]> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new Error('Import data must be a JSON array of schemas.');
    }
    const current = await loadCustomCardSchemas();
    const imported: CardSchemaPreset[] = [];

    for (const item of parsed) {
      if (item && typeof item === 'object' && item.name && item.containerSelector) {
        const schema: CardSchemaPreset = {
          id: generateId('schema'),
          name: String(item.name).trim(),
          containerSelector: String(item.containerSelector).trim(),
          fields: Array.isArray(item.fields) ? item.fields : [],
          isBuiltIn: false,
          category: item.category || 'custom',
          description: item.description,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        imported.push(schema);
      }
    }

    const merged = [...current, ...imported];
    await persistCustomSchemas(merged);
    return merged;
  } catch (err: any) {
    throw new Error(`Failed to import card schemas: ${err?.message || err}`);
  }
}
