import { describe, it, expect, vi } from 'vitest';
import {
  generateThemedPdfDocument,
  PDF_THEMES,
  PdfThemeId,
} from '../src/utils/pdfGenerator';
import { executeGeneratePdf } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('PDF Generator & Themed Briefing Engine', () => {
  it('registers all 6 curated PDF themes with style configs', () => {
    const themeKeys: PdfThemeId[] = [
      'modern_clean',
      'executive_dark',
      'minimalist_light',
      'corporate_blue',
      'academic_formal',
      'cyber_tech',
    ];

    themeKeys.forEach((key) => {
      const theme = PDF_THEMES[key];
      expect(theme).toBeDefined();
      expect(theme.name).toBeTruthy();
      expect(theme.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.bgColor).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('renders markdown elements: headings, tables, callouts, and lists', () => {
    const markdown = `
# Executive Intelligence Report

## Market Analysis
This is an introductory paragraph with **bold** and *italic* text.

| Competitor | Market Share | Growth |
| --- | --- | --- |
| Alpha Corp | 42% | +12% |
| Beta LLC | 28% | -3% |

> [!NOTE]
> Executive note for leadership review.

> [!WARNING]
> Critical supply chain bottleneck identified.

- Key takeaway 1
- Key takeaway 2
`;

    const doc = generateThemedPdfDocument({
      title: 'Quarterly Executive Review',
      theme: 'executive_dark',
      contentMarkdown: markdown,
      author: 'Intelligence Unit',
    });

    expect(doc.html).toContain('>Executive Intelligence Report</h1>');
    expect(doc.html).toContain('>Market Analysis</h2>');
    expect(doc.html).toContain('<table');
    expect(doc.html).toContain('Competitor</th>');
    expect(doc.html).toContain('class="callout callout-note"');
    expect(doc.html).toContain('class="callout callout-warning"');
    expect(doc.html).toContain('Executive note for leadership review.');
    expect(doc.html).toContain('<li>Key takeaway 1</li>');
    // Primary dataUrl must be genuine application/pdf (never .htm!)
    expect(doc.dataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(doc.pdfDataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(doc.htmlDataUrl).toMatch(/^data:text\/html;charset=utf-8;base64,/);
    expect(doc.pdfBinary.length).toBeGreaterThan(100);
  });

  it('parses extended markdown: multi-line callouts, table alignments, task lists, and highlights', () => {
    const markdown = `
# Extended Markdown Test

> [!TIP]
> Line 1 of tip alert
> Line 2 with **bold text** and \`inline code\`

| Product | Status | Price |
| :--- | :---: | ---: |
| Antigravity AI | Active | $499 |
| AutoFlow Core | Pending | $199 |

- [ ] Unfinished backlog item
- [x] Completed milestone task

This has ==crucial highlight== and ~~deprecated info~~.
`;

    const doc = generateThemedPdfDocument({
      title: 'Extended Markdown Briefing',
      theme: 'cyber_tech',
      contentMarkdown: markdown,
    });

    // Multi-line callout
    expect(doc.html).toContain('class="callout callout-tip"');
    expect(doc.html).toContain('Line 1 of tip alert<br />Line 2 with <strong>bold text</strong> and <code class="inline-code">inline code</code>');

    // Table alignments
    expect(doc.html).toContain('<th style="text-align: left;">Product</th>');
    expect(doc.html).toContain('<th style="text-align: center;">Status</th>');
    expect(doc.html).toContain('<th style="text-align: right;">Price</th>');
    expect(doc.html).toContain('<td style="text-align: left;">Antigravity AI</td>');
    expect(doc.html).toContain('<td style="text-align: center;">Active</td>');
    expect(doc.html).toContain('<td style="text-align: right;">$499</td>');

    // Task lists
    expect(doc.html).toContain('task-list');
    expect(doc.html).toContain('task-list-item');
    expect(doc.html).toContain('task-done');
    expect(doc.html).toContain('Completed milestone task');

    // Highlights and strikethroughs
    expect(doc.html).toContain('<mark class="doc-highlight">crucial highlight</mark>');
    expect(doc.html).toContain('<del>deprecated info</del>');
  });

  it('injects images in multiple positions (cover, header, inline, footer)', () => {
    const doc = generateThemedPdfDocument({
      title: 'Visual Briefing',
      theme: 'corporate_blue',
      contentMarkdown: 'Report body',
      images: [
        { url: 'https://example.com/logo.png', placement: 'header_logo' },
        { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==', placement: 'cover_page', caption: 'Live Scrape Hero' },
        { url: 'https://example.com/chart.png', placement: 'inline', caption: 'Sales Performance' },
      ],
      coverPage: true,
    });

    expect(doc.html).toContain('cover-hero');
    expect(doc.html).toContain('cover-logo');
    expect(doc.html).toContain('inline-figure');
    expect(doc.html).toContain('Sales Performance');
  });

  it('generates compliant multi-page PDF-1.4 stream binary', () => {
    const longContent = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}: Automated metric evaluation point`).join('\n');
    const doc = generateThemedPdfDocument({
      title: 'Multi-Page Binary Document',
      theme: 'modern_clean',
      contentMarkdown: longContent,
    });

    const str = doc.pdfBinary.toString('utf-8');
    expect(str).toContain('%PDF-1.4');
    expect(str).toContain('/Type /Catalog');
    expect(str).toContain('/Type /Pages');
    expect(str).toContain('/Count');
    expect(str).toContain('%%EOF');
    expect(doc.dataUrl).toMatch(/^data:application\/pdf;base64,/);
  });

  it('executes generate_pdf node via executeGeneratePdf executor', async () => {
    const node: WorkflowNode = {
      id: 'pdf_node_1',
      type: 'generate_pdf',
      position: { x: 0, y: 0 },
      data: {
        label: 'Generate Report',
        type: 'generate_pdf',
        properties: {
          title: 'Scraped Products Summary',
          theme: 'cyber_tech',
          contentMarkdown: '# Products\n\nFound {{totalCount}} products.',
          autoDownload: false,
          saveToStorage: false,
          outputVariable: 'myReportPdf',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { totalCount: 42 },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeGeneratePdf(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.myReportPdf).toBeDefined();
    expect(ctx.variables.myReportPdf.title).toBe('Scraped Products Summary');
    expect(ctx.variables.myReportPdf.theme).toBe('cyber_tech');
    // Must be application/pdf data URL so browser saves as .pdf
    expect(ctx.variables.myReportPdf.dataUrl).toContain('data:application/pdf');
  });

  it('executes AI report synthesis, enriches prompt with workflow dataset, and applies AI output', async () => {
    // Import aiService dynamically to mock queryLlm
    const aiService = await import('../src/ai/aiService');
    const queryLlmSpy = vi.spyOn(aiService, 'queryLlm').mockResolvedValueOnce(
      '# AI Synthesized Executive Report\n\nBased on the extracted products, revenue opportunity is high.\n\n| Item | Price |\n| --- | --- |\n| Widget | $25 |'
    );

    const node: WorkflowNode = {
      id: 'pdf_ai_node',
      type: 'generate_pdf',
      position: { x: 0, y: 0 },
      data: {
        label: 'AI Generate PDF',
        type: 'generate_pdf',
        properties: {
          title: 'AI Market Analysis',
          theme: 'executive_dark',
          useAi: true,
          aiModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
          aiPrompt: 'Synthesize scraped products into executive report',
          contentMarkdown: '# Static Template\n\nThis should be replaced by AI.',
          autoDownload: false,
          outputVariable: 'aiPdfOut',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_ai_wf',
      executionId: 'exec_ai_test',
      variables: {
        combinedDataset: [
          { title: 'Keyboard', price: '$80' },
          { title: 'Mouse', price: '$40' },
        ],
      },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeGeneratePdf(node, ctx);

    expect(res.success).toBe(true);
    // Verify queryLlm was called with string system instruction (not object!) and config
    expect(queryLlmSpy).toHaveBeenCalled();
    const [calledPrompt, calledSysInstruction, calledConfig] = queryLlmSpy.mock.calls[0];
    expect(typeof calledPrompt).toBe('string');
    // Prompt must include the workflow dataset context
    expect(calledPrompt).toContain('Keyboard');
    expect(calledPrompt).toContain('Mouse');
    // System instruction must be string, not object!
    expect(typeof calledSysInstruction).toBe('string');
    expect(calledSysInstruction).toContain('elite data analyst');
    expect(calledConfig?.model).toBe('deepseek-ai/DeepSeek-V4.1-Flash');

    // Output should contain AI generated markdown, NOT static template
    expect(ctx.variables.aiPdfOut).toBeDefined();
    expect(ctx.variables.aiPdfOut.dataUrl).toContain('data:application/pdf');
    queryLlmSpy.mockRestore();
  });
});
