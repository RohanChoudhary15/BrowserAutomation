import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoLayoutNodes } from '../src/utils/autoLayout';
import {
  jsonToCsv,
  dataToSpreadsheetXml,
  dataToPdfBinary,
  formatAiAgentDocument,
} from '../src/utils/documentExporter';
import { executeAiAgent } from '../src/runtime/executors';
import { WorkflowNode, WorkflowEdge } from '../src/types/workflow';
import { NodeRuntimeState } from '../src/types/execution';

describe('Auto-Layout / Tidy Nodes (Dagre)', () => {
  it('returns empty array when nodes array is empty', () => {
    const result = autoLayoutNodes([], []);
    expect(result).toEqual([]);
  });

  it('positions a single node centered within layout margins', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'node_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: { label: 'Start', category: 'browser', type: 'navigate', properties: {} },
      },
    ];
    const result = autoLayoutNodes(nodes, []);
    expect(result).toHaveLength(1);
    expect(typeof result[0].position.x).toBe('number');
    expect(typeof result[0].position.y).toBe('number');
  });

  it('arranges sequential nodes in top-to-bottom order (y strictly increases)', () => {
    const nodes: WorkflowNode[] = [
      { id: 'n1', type: 'customNode', position: { x: 900, y: 400 }, data: { label: 'Step 1', category: 'browser', type: 'navigate', properties: {} } },
      { id: 'n2', type: 'customNode', position: { x: 100, y: 800 }, data: { label: 'Step 2', category: 'interaction', type: 'click', properties: {} } },
      { id: 'n3', type: 'customNode', position: { x: 50, y: 20 }, data: { label: 'Step 3', category: 'extraction', type: 'extract_text', properties: {} } },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
    ];

    const layouted = autoLayoutNodes(nodes, edges, { direction: 'TB' });
    const n1 = layouted.find((n) => n.id === 'n1')!;
    const n2 = layouted.find((n) => n.id === 'n2')!;
    const n3 = layouted.find((n) => n.id === 'n3')!;

    expect(n1.position.y).toBeLessThan(n2.position.y);
    expect(n2.position.y).toBeLessThan(n3.position.y);
  });

  it('arranges sequential nodes in left-to-right order when direction is LR', () => {
    const nodes: WorkflowNode[] = [
      { id: 'n1', type: 'customNode', position: { x: 500, y: 500 }, data: { label: 'Step 1', category: 'browser', type: 'navigate', properties: {} } },
      { id: 'n2', type: 'customNode', position: { x: 200, y: 200 }, data: { label: 'Step 2', category: 'interaction', type: 'click', properties: {} } },
    ];
    const edges: WorkflowEdge[] = [{ id: 'e1-2', source: 'n1', target: 'n2' }];

    const layouted = autoLayoutNodes(nodes, edges, { direction: 'LR' });
    const n1 = layouted.find((n) => n.id === 'n1')!;
    const n2 = layouted.find((n) => n.id === 'n2')!;

    expect(n1.position.x).toBeLessThan(n2.position.x);
  });

  it('correctly allocates non-overlapping positions for branching paths', () => {
    const nodes: WorkflowNode[] = [
      { id: 'start', type: 'customNode', position: { x: 0, y: 0 }, data: { label: 'Start', category: 'browser', type: 'navigate', properties: {} } },
      { id: 'branchA', type: 'customNode', position: { x: 0, y: 0 }, data: { label: 'Branch A', category: 'interaction', type: 'click', properties: {} } },
      { id: 'branchB', type: 'customNode', position: { x: 0, y: 0 }, data: { label: 'Branch B', category: 'interaction', type: 'click', properties: {} } },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'start', target: 'branchA' },
      { id: 'e2', source: 'start', target: 'branchB' },
    ];

    const layouted = autoLayoutNodes(nodes, edges);
    const bA = layouted.find((n) => n.id === 'branchA')!;
    const bB = layouted.find((n) => n.id === 'branchB')!;

    expect(bA.position.x).not.toBe(bB.position.x);
  });

  it('handles special node types like loopNode, iteratorNode, and conditionNode', () => {
    const nodes: WorkflowNode[] = [
      { id: 'loop', type: 'loopNode', position: { x: 0, y: 0 }, data: { label: 'Loop', category: 'logic', type: 'condition', properties: {} } },
      { id: 'iter', type: 'iteratorNode', position: { x: 0, y: 0 }, data: { label: 'Iterator', category: 'logic', type: 'condition', properties: {} } },
      { id: 'cond', type: 'conditionNode', position: { x: 0, y: 0 }, data: { label: 'If Condition', category: 'logic', type: 'condition', properties: {} } },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'loop', target: 'iter' },
      { id: 'e2', source: 'iter', target: 'cond' },
    ];

    const layouted = autoLayoutNodes(nodes, edges);
    expect(layouted).toHaveLength(3);
    const loop = layouted.find((n) => n.id === 'loop')!;
    const iter = layouted.find((n) => n.id === 'iter')!;
    expect(loop.position.y).toBeLessThan(iter.position.y);
  });
});

describe('Document Exporter (PDF, CSV, JSON, XLSX)', () => {
  describe('jsonToCsv', () => {
    it('converts array of flat objects into CSV with headers', () => {
      const data = [
        { name: 'Alpha', score: 95 },
        { name: 'Beta', score: 88 },
      ];
      const csv = jsonToCsv(data);
      expect(csv).toContain('name,score');
      expect(csv).toContain('Alpha,95');
      expect(csv).toContain('Beta,88');
    });

    it('escapes fields containing commas, quotes, and newlines', () => {
      const data = [
        { item: 'Product "Pro"', note: 'Line 1\nLine 2', price: '$1,200.00' },
      ];
      const csv = jsonToCsv(data);
      expect(csv).toContain('"Product ""Pro"""');
      expect(csv).toContain('"Line 1\nLine 2"');
      expect(csv).toContain('"$1,200.00"');
    });

    it('handles markdown table strings', () => {
      const markdown = `
| Title | Price |
| --- | --- |
| Book 1 | $10 |
| Book 2 | $20 |
      `;
      const csv = jsonToCsv(markdown);
      expect(csv).toContain('"Title","Price"');
      expect(csv).toContain('"Book 1","$10"');
    });
  });

  describe('dataToSpreadsheetXml', () => {
    it('generates valid Microsoft Excel SpreadsheetML XML', () => {
      const data = [
        { Product: 'Widget', Price: 29.99, InStock: true },
        { Product: 'Gadget', Price: 49.5, InStock: false },
      ];
      const xml = dataToSpreadsheetXml(data, 'Sales Report');

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('progid="Excel.Sheet"');
      expect(xml).toContain('<Worksheet ss:Name="Sales Report">');
      expect(xml).toContain('<Cell ss:StyleID="Header"><Data ss:Type="String">Product</Data></Cell>');
      expect(xml).toContain('<Cell><Data ss:Type="Number">29.99</Data></Cell>');
      expect(xml).toContain('</Workbook>');
    });

    it('escapes XML special characters safely', () => {
      const data = [{ Comment: 'AT&T <telecom> & "Fiber"' }];
      const xml = dataToSpreadsheetXml(data);

      expect(xml).toContain('AT&amp;T &lt;telecom&gt; &amp; &quot;Fiber&quot;');
      expect(xml).not.toContain('<telecom>');
    });
  });

  describe('dataToPdfBinary', () => {
    it('creates valid PDF 1.4 binary structure with Helvetica font and cross-reference table', () => {
      const pdf = dataToPdfBinary('Test Document', 'Line 1 of content\nLine 2 of content');

      expect(pdf).toContain('%PDF-1.4');
      expect(pdf).toContain('/Type /Catalog');
      expect(pdf).toContain('/BaseFont /Helvetica');
      expect(pdf).toContain('Test Document');
      expect(pdf).toContain('xref');
      expect(pdf).toContain('trailer');
      expect(pdf).toContain('%%EOF');
    });
  });

  describe('formatAiAgentDocument', () => {
    it('formats plain text output', () => {
      const result = formatAiAgentDocument('Summary analysis', 'text', 'my_notes');
      expect(result.fileExtension).toBe('txt');
      expect(result.mimeType).toBe('text/plain');
      expect(result.defaultFilename).toBe('my_notes.txt');
      expect(result.dataUrl).toContain('data:text/plain');
    });

    it('formats JSON output and parses markdown JSON codeblocks', () => {
      const raw = '```json\n{"status": "approved", "score": 92}\n```';
      const result = formatAiAgentDocument(raw, 'json', 'evaluation.json');
      expect(result.fileExtension).toBe('json');
      expect(result.parsedOutput).toEqual({ status: 'approved', score: 92 });
      expect(result.defaultFilename).toBe('evaluation.json');
      expect(result.dataUrl).toContain('data:application/json');
    });

    it('formats CSV output and prepends UTF-8 BOM', () => {
      const raw = JSON.stringify([
        { item: 'Coffee', qty: 2 },
        { item: 'Tea', qty: 5 },
      ]);
      const result = formatAiAgentDocument(raw, 'csv', 'inventory');
      expect(result.fileExtension).toBe('csv');
      expect(result.defaultFilename).toBe('inventory.csv');
      expect(result.formattedContent).toContain('item,qty');
      expect(result.dataUrl).toContain('%EF%BB%BF');
    });

    it('formats XLSX output as genuine OpenXML .xlsx', () => {
      const raw = JSON.stringify([{ User: 'Alice', Role: 'Admin' }]);
      const result = formatAiAgentDocument(raw, 'xlsx', 'users');
      expect(result.fileExtension).toBe('xlsx');
      expect(result.defaultFilename).toBe('users.xlsx');
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.dataUrl).toContain('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,');
      const bytes = Buffer.from(result.formattedContent, 'base64');
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
    });

    it('formats PDF output with Base64 data URL', () => {
      const result = formatAiAgentDocument('AI executive report', 'pdf', 'executive_summary');
      expect(result.fileExtension).toBe('pdf');
      expect(result.defaultFilename).toBe('executive_summary.pdf');
      expect(result.dataUrl).toContain('data:application/pdf;base64,');
    });
  });
});

describe('AI Agent Node Multi-Format Execution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('executes AI agent node with CSV format and registers exported variables', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { name: 'John Doe', company: 'Acme Corp', role: 'CTO' },
                { name: 'Jane Smith', company: 'Beta LLC', role: 'VP Engineering' },
              ]),
            },
          },
        ],
      }),
    } as Response);

    const node: WorkflowNode = {
      id: 'ai_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'AI Data Extraction',
        category: 'utility',
        type: 'ai_agent',
        properties: {
          prompt: 'Extract executives from {{rawHtml}}',
          outputVariable: 'execList',
          outputFormat: 'csv',
          downloadFilename: 'executives_export',
        },
      },
    };

    let updatedState: Partial<NodeRuntimeState> | null = null;
    const ctx: any = {
      variables: { rawHtml: '<html>...</html>' },
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn().mockImplementation((id: string, state: Partial<NodeRuntimeState>) => {
        updatedState = state;
      }),
    };

    const result = await executeAiAgent(node, ctx);
    expect(result.success).toBe(true);
    expect(updatedState?.dynamicState?.message).toBe('CSV');
    expect(result.variables?.execList).toBeDefined();
    expect(result.variables?.execList_dataUrl).toContain('data:text/csv');
    expect(result.variables?.execList_filename).toBe('executives_export.csv');
    expect(result.variables?.execList_content).toContain('name,company,role');
  });

  it('executes AI agent with XLSX output format and sets XLSX dataUrl', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { SKU: 'SKU-001', Units: 100, Revenue: 5000 },
              ]),
            },
          },
        ],
      }),
    } as Response);

    const node: WorkflowNode = {
      id: 'ai_xlsx',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'AI Sales Report',
        category: 'utility',
        type: 'ai_agent',
        properties: {
          prompt: 'Analyze sales data',
          outputVariable: 'salesReport',
          outputFormat: 'xlsx',
          downloadFilename: 'monthly_sales',
        },
      },
    };

    const ctx: any = {
      variables: {},
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const result = await executeAiAgent(node, ctx);
    expect(result.success).toBe(true);
    expect(result.variables?.salesReport_dataUrl).toContain('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,');
    expect(result.variables?.salesReport_filename).toBe('monthly_sales.xlsx');
  });

  it('executes AI agent with PDF output format and triggers autoDownload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Strategic AI Audit Report: All systems operating within normal parameters.',
            },
          },
        ],
      }),
    } as Response);

    const downloadMock = vi.fn().mockImplementation((options, callback) => {
      callback(12345);
    });

    (globalThis as any).chrome = {
      downloads: {
        download: downloadMock,
      },
      runtime: {
        lastError: null,
      },
    };

    const node: WorkflowNode = {
      id: 'ai_pdf',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'AI Executive Summary',
        category: 'utility',
        type: 'ai_agent',
        properties: {
          prompt: 'Generate executive summary',
          outputVariable: 'pdfDoc',
          outputFormat: 'pdf',
          downloadFilename: 'board_summary',
          autoDownload: true,
        },
      },
    };

    let finalState: Partial<NodeRuntimeState> | null = null;
    const ctx: any = {
      variables: {},
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn().mockImplementation((id: string, state: Partial<NodeRuntimeState>) => {
        finalState = state;
      }),
    };

    const result = await executeAiAgent(node, ctx);
    expect(result.success).toBe(true);
    expect(result.variables?.pdfDoc_filename).toBe('board_summary.pdf');
    expect(result.variables?.pdfDoc_dataUrl).toContain('data:application/pdf;base64,');

    expect(downloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'board_summary.pdf',
        saveAs: false,
      }),
      expect.any(Function)
    );

    expect(finalState?.dynamicState?.message).toBe('PDF (saved)');

    delete (globalThis as any).chrome;
  });
});
