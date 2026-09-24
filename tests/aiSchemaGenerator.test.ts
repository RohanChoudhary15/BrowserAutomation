import { describe, it, expect, vi } from 'vitest';
import { synthesizeSchemaHeuristic, generateSchemaFromElement } from '../src/ai/schemaGenerator';
import * as aiService from '../src/ai/aiService';

describe('AI Schema Generator & Heuristic DOM Synthesizer', () => {
  it('synthesizes high-precision schema for GitHub trending repository cards', () => {
    const githubHtml = `
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/microsoft/OmniParser" data-view-component="true" class="Link">
            microsoft / <span class="text-normal">OmniParser</span>
          </a>
        </h2>
        <p class="col-9 color-fg-muted my-1 pr-4">
          A simple screen parsing tool towards pure vision based GUI agent.
        </p>
        <div class="f6 color-fg-muted mt-2">
          <span class="d-inline-block ml-0 mr-3">
            <span class="repo-language-color" style="background-color: #3572A5"></span>
            <span itemprop="programmingLanguage">Python</span>
          </span>
          <a href="/microsoft/OmniParser/stargazers" class="Link--muted d-inline-block mr-3">
            12,345
          </a>
          <a href="/microsoft/OmniParser/forks" class="Link--muted d-inline-block mr-3">
            1,234
          </a>
          <span class="d-inline-block float-sm-right">
            2,345 stars today
          </span>
        </div>
      </article>
    `;

    const schema = synthesizeSchemaHeuristic({
      selector: 'article.Box-row',
      tagName: 'article',
      htmlSnippet: githubHtml,
      textSnippet: 'microsoft / OmniParser Python 12,345',
      url: 'https://github.com/trending',
    });

    expect(schema.category).toBe('github_repo');
    expect(schema.containerSelector).toContain('Box-row');
    const fieldNames = schema.fields.map(f => f.name);
    expect(fieldNames).toContain('repo_name');
    expect(fieldNames).toContain('repo_url');
    expect(fieldNames).toContain('description');
    expect(fieldNames).toContain('language');
    expect(fieldNames).toContain('stars');
    expect(fieldNames).toContain('forks');

    const repoUrlField = schema.fields.find(f => f.name === 'repo_url');
    expect(repoUrlField?.attribute).toBe('href');
  });

  it('synthesizes e-commerce schema for shopping product cards', () => {
    const productHtml = `
      <div class="product-card">
        <h3 class="product-title">Sony WH-1000XM5 Headphones</h3>
        <div class="price-box">
          <span class="price">$399.99</span>
        </div>
        <img src="/img/sony.jpg" alt="Sony Headphones" />
        <a href="/products/sony-wh-1000xm5">View details</a>
        <p class="description">Industry leading noise cancellation.</p>
      </div>
    `;

    const schema = synthesizeSchemaHeuristic({
      selector: '.product-card',
      tagName: 'div',
      htmlSnippet: productHtml,
      textSnippet: 'Sony WH-1000XM5 Headphones $399.99',
    });

    expect(schema.category).toBe('e_commerce');
    const fieldNames = schema.fields.map(f => f.name);
    expect(fieldNames).toContain('title');
    expect(fieldNames).toContain('price');
    expect(fieldNames).toContain('image');
    expect(fieldNames).toContain('link');

    const imgField = schema.fields.find(f => f.name === 'image');
    expect(imgField?.attribute).toBe('src');
  });

  it('synthesizes article publication schema for blog / news items', () => {
    const articleHtml = `
      <article class="post-preview">
        <h2 class="headline"><a href="/news/ai-breakthrough">Autonomous Web Agents in 2026</a></h2>
        <span class="author" rel="author">Jane Doe</span>
        <time class="date" datetime="2026-09-24">September 24, 2026</time>
        <p class="summary">A deep dive into multi-modal vision automation.</p>
        <img src="/images/banner.jpg" />
      </article>
    `;

    const schema = synthesizeSchemaHeuristic({
      selector: 'article.post-preview',
      tagName: 'article',
      htmlSnippet: articleHtml,
    });

    expect(schema.category).toBe('article');
    const fieldNames = schema.fields.map(f => f.name);
    expect(fieldNames).toContain('headline');
    expect(fieldNames).toContain('url');
    expect(fieldNames).toContain('author');
    expect(fieldNames).toContain('date');
    expect(fieldNames).toContain('summary');
  });

  it('calls queryLlm and parses structured schema returned by AI', async () => {
    const mockAiResponse = JSON.stringify({
      containerSelector: 'article.Box-row',
      category: 'github_repo',
      summary: 'GitHub Trending Repository',
      fields: [
        { name: 'repo_title', selector: 'h2 a', attribute: 'text' },
        { name: 'repo_link', selector: 'h2 a', attribute: 'href' },
        { name: 'about', selector: 'p', attribute: 'text' },
        { name: 'tech_stack', selector: '[itemprop="programmingLanguage"]', attribute: 'text' },
      ],
    });

    vi.spyOn(aiService, 'queryLlm').mockResolvedValueOnce(mockAiResponse);

    const result = await generateSchemaFromElement({
      selector: 'article.Box-row',
      tagName: 'article',
      htmlSnippet: '<article class="Box-row"><h2><a href="/test">test</a></h2></article>',
    });

    expect(result.containerSelector).toBe('article.Box-row');
    expect(result.fields.length).toBe(4);
    expect(result.fields[0].name).toBe('repo_title');
    expect(result.fields[0].attribute).toBe('text');
    expect(result.fields[1].name).toBe('repo_link');
    expect(result.fields[1].attribute).toBe('href');
  });

  it('gracefully falls back to heuristic synthesizer if AI service fails', async () => {
    vi.spyOn(aiService, 'queryLlm').mockRejectedValueOnce(new Error('Network error'));

    const result = await generateSchemaFromElement({
      selector: 'article.Box-row',
      tagName: 'article',
      htmlSnippet: '<article class="Box-row"><span itemprop="programmingLanguage">Rust</span></article>',
    });

    expect(result.category).toBe('github_repo');
    expect(result.fields.some(f => f.name === 'language')).toBe(true);
  });
});
