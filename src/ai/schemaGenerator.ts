import { queryLlm } from './aiService';
import { ExtractDatasetField } from '../content/domActions';

export interface SchemaGeneratorInput {
  selector?: string;
  tagName?: string;
  htmlSnippet?: string;
  textSnippet?: string;
  url?: string;
}

export interface GeneratedSchemaResult {
  containerSelector: string;
  fields: ExtractDatasetField[];
  category?: string;
  summary?: string;
}

/**
 * Heuristic fallback synthesizer that parses HTML and extracts sensible fields
 * without needing an external API key or internet connection.
 */
export function synthesizeSchemaHeuristic(input: SchemaGeneratorInput): GeneratedSchemaResult {
  const html = input.htmlSnippet || '';
  const text = input.textSnippet || '';
  const sel = input.selector || '';
  const tag = (input.tagName || '').toLowerCase();

  // 1. Detect GitHub Repositories (Trending / Search / User lists)
  if (
    /Box-row|stargazers|programmingLanguage|repo-language|float-sm-right|octicon/i.test(html) ||
    /github\.com/i.test(input.url || '') ||
    /Box-row/i.test(sel)
  ) {
    return {
      containerSelector: sel || 'article.Box-row, .Box-row',
      category: 'github_repo',
      summary: 'GitHub Repository Card',
      fields: [
        { name: 'repo_name', selector: 'h1 a, h2 a, a.Link', attribute: 'text' },
        { name: 'repo_url', selector: 'h1 a, h2 a, a.Link', attribute: 'href' },
        { name: 'description', selector: 'p', attribute: 'text' },
        { name: 'language', selector: '[itemprop="programmingLanguage"], .repo-language-color + span', attribute: 'text' },
        { name: 'stars', selector: 'a[href*="stargazers"], a[href*="stars"]', attribute: 'text' },
        { name: 'forks', selector: 'a[href*="forks"]', attribute: 'text' },
        { name: 'stars_today', selector: 'span.float-sm-right, [class*="stars"]', attribute: 'text' },
      ],
    };
  }

  // 2. Detect E-Commerce Products (price, currency, add to cart)
  if (
    /[\$€£¥₹\u20AC\u00A3\u00A5\u20B9]|\b(price|pricing|add-to-cart|cart|product|checkout)\b/i.test(html) ||
    /[\$€£¥₹]/.test(text)
  ) {
    const fields: ExtractDatasetField[] = [
      { name: 'title', selector: 'h2, h3, h1, h4, .title, [class*="title" i]', attribute: 'text' },
      { name: 'price', selector: '.price, [class*="price" i], p.price, span.price, b, strong', attribute: 'text' },
    ];
    if (/<img/i.test(html)) {
      fields.push({ name: 'image', selector: 'img', attribute: 'src' });
    }
    if (/<a[^>]*href/i.test(html)) {
      fields.push({ name: 'link', selector: 'a', attribute: 'href' });
    }
    if (/<p/i.test(html)) {
      fields.push({ name: 'description', selector: 'p, .description, [class*="desc" i]', attribute: 'paragraphs' });
    }
    if (/rating|star|review/i.test(html)) {
      fields.push({ name: 'rating', selector: '[class*="rating" i], [class*="star" i], [aria-label*="star" i]', attribute: 'text' });
    }

    return {
      containerSelector: sel || (tag && tag !== 'body' && tag !== 'div' ? tag : '.product-card, article'),
      category: 'e_commerce',
      summary: 'E-Commerce Product Card',
      fields,
    };
  }

  // 3. Detect Articles, News, or Blog Posts
  if (/author|article|post|headline|byline|published|<time/i.test(html)) {
    const fields: ExtractDatasetField[] = [
      { name: 'headline', selector: 'h2, h3, h1, h4, a, [class*="title" i]', attribute: 'text' },
    ];
    if (/<a[^>]*href/i.test(html)) {
      fields.push({ name: 'url', selector: 'a', attribute: 'href' });
    }
    if (/<p/i.test(html)) {
      fields.push({ name: 'summary', selector: 'p, [class*="summary" i], [class*="desc" i]', attribute: 'text' });
    }
    if (/author|[rel="author"]/i.test(html)) {
      fields.push({ name: 'author', selector: '[rel="author"], .author, [class*="author" i]', attribute: 'text' });
    }
    if (/<time|date/i.test(html)) {
      fields.push({ name: 'date', selector: 'time, .date, [class*="date" i]', attribute: 'text' });
    }
    if (/<img/i.test(html)) {
      fields.push({ name: 'image', selector: 'img', attribute: 'src' });
    }

    return {
      containerSelector: sel || (tag && tag !== 'body' && tag !== 'div' ? tag : 'article, .post, .article-card'),
      category: 'article',
      summary: 'Article / Publication Card',
      fields,
    };
  }

  // 4. Detect Job Postings / Listings
  if (/job|salary|company|employer|location|remote|hiring/i.test(html)) {
    return {
      containerSelector: sel || (tag && tag !== 'body' && tag !== 'div' ? tag : '.job-item, li, article'),
      category: 'job_listing',
      summary: 'Job Listing Card',
      fields: [
        { name: 'job_title', selector: 'h2, h3, [class*="title" i], strong', attribute: 'text' },
        { name: 'company', selector: '[class*="company" i], [class*="employer" i]', attribute: 'text' },
        { name: 'location', selector: '[class*="location" i], [class*="place" i]', attribute: 'text' },
        { name: 'link', selector: 'a[href]', attribute: 'href' },
        { name: 'description', selector: 'p, [class*="desc" i], [class*="summary" i]', attribute: 'text' },
      ],
    };
  }

  // 5. Generic DOM Inspection
  const fields: ExtractDatasetField[] = [];
  if (/<(h1|h2|h3|h4|h5|h6)/i.test(html) || /title|header/i.test(html)) {
    fields.push({ name: 'title', selector: 'h2, h3, h1, h4, [role="heading"], [class*="title" i]', attribute: 'text' });
  }
  if (/<a[^>]*href/i.test(html)) {
    fields.push({ name: 'link', selector: 'a', attribute: 'href' });
  }
  if (/<p/i.test(html)) {
    fields.push({ name: 'description', selector: 'p', attribute: 'text' });
  }
  if (/<img/i.test(html)) {
    fields.push({ name: 'image', selector: 'img', attribute: 'src' });
  }
  if (/<time/i.test(html)) {
    fields.push({ name: 'date', selector: 'time', attribute: 'text' });
  }
  if (/[class*="badge" i]|[class*="tag" i]/i.test(html)) {
    fields.push({ name: 'badge', selector: '[class*="badge" i], [class*="tag" i]', attribute: 'text' });
  }

  if (fields.length === 0) {
    fields.push({ name: 'text_content', selector: '', attribute: 'text' });
  }

  return {
    containerSelector: sel || (tag && tag !== 'body' && tag !== 'div' ? tag : '.card, li, article, div'),
    category: 'generic',
    summary: 'Custom Content Card',
    fields,
  };
}

/**
 * Extracts and parses a JSON object from raw LLM text response
 */
function extractJsonFromText(raw: string): any {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Try direct parse
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Try fenced markdown block: ```json ... ```
  const matchFenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (matchFenced && matchFenced[1]) {
    try {
      return JSON.parse(matchFenced[1].trim());
    } catch {}
  }

  // 3. Try finding first { and last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  return null;
}

/**
 * AI-driven Schema Generator:
 * Takes a selected element's HTML & metadata, queries the configured LLM,
 * and falls back seamlessly to the semantic synthesizer if offline or unconfigured.
 */
export async function generateSchemaFromElement(
  input: SchemaGeneratorInput
): Promise<GeneratedSchemaResult> {
  const heuristicResult = synthesizeSchemaHeuristic(input);

  const systemInstruction = `You are an expert web scraping and DOM schema architect.
Your job is to analyze the provided HTML of a card / item element from a webpage and generate a clean, accurate extraction schema for AutoFlow browser automation.

Rules:
1. Identify the exact category of the item (e.g. "github_repo", "e_commerce", "article", "job_listing", "social_post", "lead", "table_row").
2. Determine the best repeating CSS container selector (e.g. "article.Box-row", ".product-card", "li.listing", "tr").
3. Generate an array of clean fields to extract from EACH repeating card.
   - Field names should be concise snake_case identifiers (e.g. "repo_name", "repo_url", "description", "language", "stars", "forks", "title", "price", "image", "link").
   - Each field "selector" MUST be relative to the card container (e.g. "h2 a, h1 a", "p", "a[href*='stargazers']", ".price", "img").
   - Support flexible selectors for titles (e.g. "h2, h3, a" or specific classes).
   - Each field "attribute" MUST be one of:
     - "text" (for visible text, titles, numbers, labels, ratings)
     - "href" (for hyperlinks, URLs)
     - "src" (for images)
     - "paragraphs" (for multi-paragraph body text)
     - "value" (for input elements)
4. Do NOT hallucinate fields that don't exist in the HTML (e.g. do NOT include "price" if this is a GitHub repository card or an article).
5. Output MUST be ONLY valid JSON matching this schema:
{
  "containerSelector": "...",
  "category": "...",
  "summary": "...",
  "fields": [
    { "name": "...", "selector": "...", "attribute": "text" | "href" | "src" | "paragraphs" | "value" }
  ]
}`;

  const userPrompt = `Analyze this DOM element and generate a scraping schema:
Element Tag: <${input.tagName || 'div'}>
Element Selector: ${input.selector || heuristicResult.containerSelector}
${input.url ? `Page URL: ${input.url}` : ''}

HTML Snippet:
${(input.htmlSnippet || '').slice(0, 3500)}

Text Content:
${(input.textSnippet || '').slice(0, 500)}
`;

  try {
    const rawAiResponse = await queryLlm(userPrompt, systemInstruction);
    const parsed = extractJsonFromText(rawAiResponse);

    if (parsed && Array.isArray(parsed.fields) && parsed.fields.length > 0) {
      // Validate and sanitize fields
      const cleanFields: ExtractDatasetField[] = parsed.fields
        .filter((f: any) => f && typeof f.name === 'string' && f.name.trim() !== '')
        .map((f: any) => ({
          name: String(f.name).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
          selector: typeof f.selector === 'string' ? f.selector.trim() : '',
          attribute: ['text', 'href', 'src', 'paragraphs', 'value'].includes(String(f.attribute).toLowerCase())
            ? (String(f.attribute).toLowerCase() as any)
            : 'text',
        }));

      if (cleanFields.length > 0) {
        return {
          containerSelector: parsed.containerSelector || input.selector || heuristicResult.containerSelector,
          category: parsed.category || heuristicResult.category || 'custom',
          summary: parsed.summary || heuristicResult.summary || `${cleanFields.length} extracted fields`,
          fields: cleanFields,
        };
      }
    }
  } catch (err: any) {
    console.warn('[AutoFlow] AI Schema generation call failed, using heuristic synthesizer:', err?.message || err);
  }

  // Return heuristic result if AI was offline, failed, or produced malformed response
  return heuristicResult;
}
