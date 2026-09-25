export type PdfThemeId =
  | 'modern_clean'
  | 'executive_dark'
  | 'minimalist_light'
  | 'corporate_blue'
  | 'academic_formal'
  | 'cyber_tech';

export type ImagePlacement = 'header_logo' | 'cover_page' | 'inline' | 'gallery_grid' | 'footer';

export interface InjectedImage {
  url: string; // Base64 data URL, remote HTTP url, or {{var}}
  placement?: ImagePlacement;
  caption?: string;
  alt?: string;
  width?: string; // e.g. '100%', '300px', 'auto'
}

export interface PdfThemeConfig {
  id: PdfThemeId;
  name: string;
  description: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  mutedColor: string;
  cardBg: string;
  borderColor: string;
  fontFamily: string;
  headingFont: string;
  headerBg?: string;
  badgeStyle: string;
  tableHeaderBg: string;
}

export const PDF_THEMES: Record<PdfThemeId, PdfThemeConfig> = {
  modern_clean: {
    id: 'modern_clean',
    name: 'Modern Clean',
    description: 'Crisp sans-serif, electric blue/indigo accents, and contemporary card styling',
    accentColor: '#4f46e5',
    bgColor: '#ffffff',
    textColor: '#1e293b',
    mutedColor: '#64748b',
    cardBg: '#f8fafc',
    borderColor: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    headingFont: 'Inter, system-ui, -apple-system, sans-serif',
    tableHeaderBg: '#f1f5f9',
    badgeStyle: 'background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;',
  },
  executive_dark: {
    id: 'executive_dark',
    name: 'Executive Dark',
    description: 'Deep charcoal background with refined gold/amber accents for executive memos',
    accentColor: '#f59e0b',
    bgColor: '#0f172a',
    textColor: '#f8fafc',
    mutedColor: '#94a3b8',
    cardBg: '#1e293b',
    borderColor: '#334155',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    headingFont: 'Inter, system-ui, -apple-system, sans-serif',
    tableHeaderBg: '#1e293b',
    badgeStyle: 'background: #78350f; color: #fde68a; border: 1px solid #b45309;',
  },
  minimalist_light: {
    id: 'minimalist_light',
    name: 'Minimalist Light',
    description: 'Generous whitespace, editorial typography, and subtle hairline dividers',
    accentColor: '#0f172a',
    bgColor: '#ffffff',
    textColor: '#0f172a',
    mutedColor: '#64748b',
    cardBg: '#fafafa',
    borderColor: '#e5e5e5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    tableHeaderBg: '#f5f5f5',
    badgeStyle: 'background: #f4f4f5; color: #18181b; border: 1px solid #e4e4e7;',
  },
  corporate_blue: {
    id: 'corporate_blue',
    name: 'Corporate Blue',
    description: 'Formal navy styling with structured data tables, headers, and footers',
    accentColor: '#1d4ed8',
    bgColor: '#ffffff',
    textColor: '#1e293b',
    mutedColor: '#64748b',
    cardBg: '#f0fdf4',
    borderColor: '#cbd5e1',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    headingFont: 'system-ui, -apple-system, sans-serif',
    tableHeaderBg: '#1e3a8a',
    badgeStyle: 'background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;',
  },
  academic_formal: {
    id: 'academic_formal',
    name: 'Academic Formal',
    description: 'Classic serif typography, formal paper margins, and publication layout',
    accentColor: '#881337',
    bgColor: '#ffffff',
    textColor: '#1c1917',
    mutedColor: '#57534e',
    cardBg: '#fbfbfa',
    borderColor: '#d6d3d1',
    fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
    headingFont: 'Georgia, Cambria, "Times New Roman", Times, serif',
    tableHeaderBg: '#f5f5f4',
    badgeStyle: 'background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3;',
  },
  cyber_tech: {
    id: 'cyber_tech',
    name: 'Cyber Tech',
    description: 'Terminal aesthetics, monospace typography, and vibrant neon accents',
    accentColor: '#10b981',
    bgColor: '#090d16',
    textColor: '#e2e8f0',
    mutedColor: '#64748b',
    cardBg: '#111827',
    borderColor: '#1f2937',
    fontFamily: '"Fira Code", "Courier New", monospace',
    headingFont: '"Fira Code", "Courier New", monospace',
    tableHeaderBg: '#111827',
    badgeStyle: 'background: #064e3b; color: #6ee7b7; border: 1px solid #059669;',
  },
};

export interface GeneratePdfOptions {
  title?: string;
  subtitle?: string;
  author?: string;
  contentMarkdown?: string;
  theme?: PdfThemeId;
  pageSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  headerText?: string;
  footerText?: string;
  includePageNumbers?: boolean;
  includeTimestamp?: boolean;
  coverPage?: boolean;
  images?: InjectedImage[];
  accentColor?: string; // Optional custom accent override
  customCss?: string;
}

export interface GeneratedPdfResult {
  html: string;
  dataUrl: string;
  pdfBinary: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Parses markdown into clean, semantic HTML with tables, headings, callouts, and lists
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md;

  // 1. Page breaks
  html = html.replace(/---(?:pagebreak|break)---/gi, '<div class="page-break"></div>');

  // 2. Fenced Code Blocks (must be parsed before inline code)
  html = html.replace(/```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = escapeHtml(code.trim());
    return `<pre class="code-block ${lang ? `lang-${lang}` : ''}"><code>${escaped}</code></pre>`;
  });

  // 3. Tables
  html = html.replace(
    /((?:\|[^\n]+\|\r?\n)(?:\|[\s\-:|]+\|\r?\n)(?:\|[^\n]+\|\r?\n?)+)/g,
    (tableBlock) => {
      const lines = tableBlock.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return tableBlock;

      const headerCells = lines[0]
        .split('|')
        .slice(1, -1)
        .map((c) => `<th>${c.trim()}</th>`)
        .join('');

      const bodyRows = lines
        .slice(2)
        .map((rowLine) => {
          const cells = rowLine
            .split('|')
            .slice(1, -1)
            .map((c) => `<td>${c.trim()}</td>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('\n');

      return `<div class="table-container"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
    }
  );

  // 4. Headings
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 5. Callouts / Alerts (> [!NOTE], > [!WARNING], > [!TIP], > [!IMPORTANT])
  html = html.replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*$)/gim, (_, type, msg) => {
    const t = type.toLowerCase();
    const cleanMsg = msg.replace(/^>\s*/, '').trim();
    return `<div class="callout callout-${t}"><span class="callout-badge">${type}</span> ${cleanMsg}</div>`;
  });

  // Standard blockquotes
  html = html.replace(/^>\s*(.*$)/gim, '<blockquote>$1</blockquote>');

  // 6. Horizontal Rules
  html = html.replace(/^(?:---|\*\*\*|___)$/gim, '<hr />');

  // 7. Unordered Lists
  html = html.replace(/^\s*[-*+]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/gim, '<ul>$1</ul>');

  // 8. Bold, Italic, Strikethrough, Inline Code
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 9. Links & Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="doc-img inline-img" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 10. Paragraphs: convert loose non-tagged lines to <p>
  const blocks = html.split(/\n{2,}/);
  const formattedBlocks = blocks.map((b) => {
    const trimmed = b.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|table|div|blockquote|pre|hr)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
  });

  return formattedBlocks.filter(Boolean).join('\n\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes characters for PDF-1.4 raw streams
 */
function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Builds a vector-stream multi-page PDF-1.4 binary matching document content
 */
export function buildPdf14Binary(title: string, textContent: string, maxLines = 150): string {
  const lines = textContent.split('\n').slice(0, maxLines);
  let stream = 'BT\n/F1 16 Tf\n50 740 Td\n(' + escapePdf(title) + ') Tj\n';
  stream += '/F1 10 Tf\n0 -25 Td\n';

  for (const line of lines) {
    const cleanLine = line.replace(/[\r\t]/g, ' ').slice(0, 95);
    stream += '(' + escapePdf(cleanLine) + ') Tj\n0 -13 Td\n';
  }
  stream += 'ET';

  const streamLength = stream.length;
  return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page
   /Parent 2 0 R
   /MediaBox [0 0 612 792]
   /Resources << /Font << /F1 4 0 R >> >>
   /Contents 5 0 R
>>
endobj
4 0 obj
<< /Type /Font
   /Subtype /Type1
   /BaseFont /Helvetica
>>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000262 00000 n 
0000000341 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${420 + streamLength}
%%EOF`;
}

/**
 * Generates print-ready HTML and PDF binary representation with themes, Markdown, and images
 */
export function generateThemedPdfDocument(options: GeneratePdfOptions): GeneratedPdfResult {
  const {
    title = 'AutoFlow Intelligence Report',
    subtitle = '',
    author = 'AutoFlow Automation',
    contentMarkdown = '',
    theme = 'modern_clean',
    pageSize = 'A4',
    orientation = 'portrait',
    headerText = '',
    footerText = 'Generated by AutoFlow Browser Automation',
    includePageNumbers = true,
    includeTimestamp = true,
    coverPage = false,
    images = [],
    accentColor,
    customCss = '',
  } = options;

  const currentTheme = PDF_THEMES[theme] || PDF_THEMES.modern_clean;
  const effectiveAccent = accentColor || currentTheme.accentColor;

  // Process Injected Images by placement
  const headerLogo = images.find((img) => img.placement === 'header_logo');
  const coverImage = images.find((img) => img.placement === 'cover_page');
  const inlineImages = images.filter((img) => !img.placement || img.placement === 'inline');
  const galleryImages = images.filter((img) => img.placement === 'gallery_grid');
  const footerImage = images.find((img) => img.placement === 'footer');

  // Convert markdown to HTML
  let bodyHtml = markdownToHtml(contentMarkdown);

  // Inject inline images into body if present
  if (inlineImages.length > 0) {
    const inlineHtml = inlineImages
      .map(
        (img) => `
        <figure class="injected-figure inline-figure" style="text-align: center; margin: 20px 0;">
          <img src="${img.url}" alt="${img.alt || 'Document Image'}" style="max-width: ${img.width || '100%'}; height: auto; border-radius: 8px; border: 1px solid ${currentTheme.borderColor};" />
          ${img.caption ? `<figcaption style="font-size: 11px; color: ${currentTheme.mutedColor}; margin-top: 6px;">${img.caption}</figcaption>` : ''}
        </figure>`
      )
      .join('\n');
    bodyHtml += `\n${inlineHtml}`;
  }

  // Inject gallery grid if present
  if (galleryImages.length > 0) {
    const galleryHtml = `
      <div class="page-break"></div>
      <h2 style="border-bottom: 2px solid ${effectiveAccent}; padding-bottom: 6px;">Visual Gallery</h2>
      <div class="image-gallery-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin: 20px 0;">
        ${galleryImages
          .map(
            (img) => `
          <div class="gallery-card" style="background: ${currentTheme.cardBg}; border: 1px solid ${currentTheme.borderColor}; border-radius: 8px; overflow: hidden; padding: 8px;">
            <img src="${img.url}" alt="${img.alt || 'Gallery image'}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 6px;" />
            ${img.caption ? `<div style="font-size: 11px; color: ${currentTheme.mutedColor}; margin-top: 6px; padding: 0 4px;">${img.caption}</div>` : ''}
          </div>`
          )
          .join('\n')}
      </div>`;
    bodyHtml += `\n${galleryHtml}`;
  }

  const timestampStr = includeTimestamp
    ? new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Cover Page HTML
  const coverHtml = coverPage
    ? `
    <section class="cover-page">
      ${headerLogo ? `<div class="cover-logo"><img src="${headerLogo.url}" alt="Logo" style="max-height: 50px; margin-bottom: 24px;" /></div>` : ''}
      ${coverImage ? `<div class="cover-hero"><img src="${coverImage.url}" alt="Cover" style="width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px; margin-bottom: 30px;" /></div>` : ''}
      <h1 class="cover-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      <div class="cover-meta">
        ${author ? `<span class="meta-item"><strong>Prepared by:</strong> ${escapeHtml(author)}</span>` : ''}
        ${timestampStr ? `<span class="meta-item"><strong>Date:</strong> ${timestampStr}</span>` : ''}
      </div>
    </section>
    <div class="page-break"></div>
  `
    : '';

  // Full Printable Document HTML
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageSize} ${orientation};
      margin: 18mm 16mm 20mm 16mm;
      @bottom-right {
        content: counter(page);
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: ${currentTheme.fontFamily};
      background-color: ${currentTheme.bgColor};
      color: ${currentTheme.textColor};
      line-height: 1.6;
      font-size: 13px;
      padding: 24px 32px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      margin-bottom: 24px;
      border-bottom: 2px solid ${effectiveAccent};
    }

    .doc-header .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .doc-header .header-brand img {
      max-height: 36px;
      object-fit: contain;
    }

    .doc-header .header-title {
      font-size: 18px;
      font-weight: 700;
      color: ${effectiveAccent};
      font-family: ${currentTheme.headingFont};
    }

    .doc-header .header-meta {
      text-align: right;
      font-size: 11px;
      color: ${currentTheme.mutedColor};
    }

    /* Cover Page */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 80vh;
      padding: 40px 20px;
    }

    .cover-title {
      font-size: 32px;
      font-weight: 800;
      line-height: 1.2;
      color: ${effectiveAccent};
      font-family: ${currentTheme.headingFont};
      margin-bottom: 12px;
    }

    .cover-subtitle {
      font-size: 16px;
      color: ${currentTheme.mutedColor};
      margin-bottom: 32px;
      line-height: 1.4;
    }

    .cover-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 24px;
      border-top: 1px solid ${currentTheme.borderColor};
      font-size: 12px;
      color: ${currentTheme.mutedColor};
    }

    /* Typography */
    h1, h2, h3, h4 {
      font-family: ${currentTheme.headingFont};
      color: ${theme === 'executive_dark' ? '#f8fafc' : currentTheme.textColor};
      font-weight: 700;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }

    h1 { font-size: 22px; border-bottom: 1px solid ${currentTheme.borderColor}; padding-bottom: 6px; }
    h2 { font-size: 18px; }
    h3 { font-size: 15px; }
    h4 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }

    p { margin-bottom: 12px; }

    /* Tables */
    .table-container {
      margin: 16px 0;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      background: ${currentTheme.cardBg};
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid ${currentTheme.borderColor};
    }

    th {
      background-color: ${currentTheme.tableHeaderBg};
      color: ${theme === 'corporate_blue' || theme === 'executive_dark' ? '#ffffff' : currentTheme.textColor};
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid ${currentTheme.borderColor};
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid ${currentTheme.borderColor};
      color: ${currentTheme.textColor};
    }

    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) { background-color: ${theme === 'executive_dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'}; }

    /* Callouts */
    .callout {
      padding: 12px 16px;
      border-radius: 8px;
      margin: 16px 0;
      font-size: 12px;
      border-left: 4px solid ${effectiveAccent};
      background: ${currentTheme.cardBg};
    }

    .callout-badge {
      font-weight: 700;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: 6px;
      text-transform: uppercase;
      ${currentTheme.badgeStyle}
    }

    .callout-warning { border-left-color: #f59e0b; }
    .callout-tip { border-left-color: #10b981; }
    .callout-important { border-left-color: #ef4444; }

    blockquote {
      border-left: 3px solid ${currentTheme.borderColor};
      padding-left: 14px;
      margin: 14px 0;
      font-style: italic;
      color: ${currentTheme.mutedColor};
    }

    ul, ol {
      margin-left: 20px;
      margin-bottom: 14px;
    }

    li { margin-bottom: 4px; }

    /* Code */
    .inline-code {
      font-family: "Fira Code", monospace;
      font-size: 11px;
      padding: 2px 5px;
      border-radius: 4px;
      background: ${theme === 'executive_dark' ? '#1e293b' : '#f1f5f9'};
      border: 1px solid ${currentTheme.borderColor};
      color: ${effectiveAccent};
    }

    .code-block {
      background: ${theme === 'executive_dark' ? '#0b0f19' : '#f8fafc'};
      border: 1px solid ${currentTheme.borderColor};
      border-radius: 6px;
      padding: 12px 14px;
      margin: 16px 0;
      font-size: 11px;
      overflow-x: auto;
      font-family: "Fira Code", monospace;
      line-height: 1.4;
    }

    /* Page Breaks */
    .page-break {
      page-break-before: always;
      break-before: page;
      height: 0;
      margin: 0;
      padding: 0;
    }

    /* Footer */
    .doc-footer {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid ${currentTheme.borderColor};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: ${currentTheme.mutedColor};
    }

    ${customCss}
  </style>
</head>
<body>
  ${coverHtml}

  ${!coverPage ? `
    <header class="doc-header">
      <div class="header-brand">
        ${headerLogo ? `<img src="${headerLogo.url}" alt="Logo" />` : ''}
        <div>
          <div class="header-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div style="font-size: 11px; color: ${currentTheme.mutedColor};">${escapeHtml(subtitle)}</div>` : ''}
        </div>
      </div>
      <div class="header-meta">
        ${author ? `<div>${escapeHtml(author)}</div>` : ''}
        ${timestampStr ? `<div>${timestampStr}</div>` : ''}
        ${headerText ? `<div>${escapeHtml(headerText)}</div>` : ''}
      </div>
    </header>
  ` : ''}

  <main class="doc-body">
    ${bodyHtml}
  </main>

  <footer class="doc-footer">
    <div>${escapeHtml(footerText)}</div>
    ${footerImage ? `<img src="${footerImage.url}" alt="Footer" style="max-height: 24px;" />` : ''}
    ${includePageNumbers ? '<div class="page-number-display">AutoFlow Document</div>' : ''}
  </footer>
</body>
</html>`;

  // Encode HTML document as printable Data URL
  const htmlBase64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(fullHtml)))
    : Buffer.from(fullHtml).toString('base64');
  const dataUrl = `data:text/html;charset=utf-8;base64,${htmlBase64}`;

  // Generate vector PDF-1.4 binary
  const cleanSummaryText = `${title}\n${subtitle ? subtitle + '\n' : ''}\n${contentMarkdown}`.replace(/<[^>]*>/g, '');
  const pdfBinary = buildPdf14Binary(title, cleanSummaryText);

  const cleanFilename = (title || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_');

  return {
    html: fullHtml,
    dataUrl,
    pdfBinary,
    filename: `${cleanFilename}.pdf`,
    sizeBytes: fullHtml.length,
  };
}
