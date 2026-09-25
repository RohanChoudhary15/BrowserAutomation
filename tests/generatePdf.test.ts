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
    expect(doc.html).toContain('<th>Competitor</th>');
    expect(doc.html).toContain('class="callout callout-note"');
    expect(doc.html).toContain('class="callout callout-warning"');
    expect(doc.html).toContain('Executive note for leadership review.');
    expect(doc.html).toContain('<li>Key takeaway 1</li>');
    expect(doc.dataUrl).toMatch(/^data:text\/html;charset=utf-8;base64,/);
    expect(doc.pdfBinary.length).toBeGreaterThan(100);
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

  it('generates compliant PDF-1.4 stream binary', () => {
    const doc = generateThemedPdfDocument({
      title: 'Binary Test Document',
      theme: 'modern_clean',
      contentMarkdown: 'Testing raw vector stream output.',
    });

    const str = doc.pdfBinary.toString('utf-8');
    expect(str).toContain('%PDF-1.4');
    expect(str).toContain('/Type /Catalog');
    expect(str).toContain('%%EOF');
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
    expect(ctx.variables.myReportPdf.dataUrl).toContain('data:text/html');
  });
});
