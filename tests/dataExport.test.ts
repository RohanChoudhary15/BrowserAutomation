import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  jsonToCsv,
  dataToSpreadsheetXml,
  dataToHtmlTable,
  zipVariablesToDataset,
  createExportDocument,
} from '../src/utils/documentExporter';
import { extractDataset } from '../src/content/domActions';
import {
  executeExportData,
  executeExtractMultiple,
} from '../src/runtime/executors';
import { ExecutionContext } from '../src/types/execution';
import { WorkflowNode } from '../src/types/workflow';

describe('Data Export System (CSV, XLSX, JSON, TSV, HTML)', () => {
  describe('Document Exporter Utilities', () => {
    it('converts array of objects to valid CSV with escaping', () => {
      const data = [
        { name: 'Apple, Inc.', price: 150.5, note: 'Quote "Hello"' },
        { name: 'Banana Corp', price: 25.0, note: 'Simple' },
      ];
      const csv = jsonToCsv(data);
      expect(csv).toContain('name,price,note');
      expect(csv).toContain('"Apple, Inc.",150.5,"Quote ""Hello"""');
      expect(csv).toContain('Banana Corp,25,Simple');
    });

    it('supports custom delimiters (semicolon, tab, pipe)', () => {
      const data = [
        { product: 'Shoes', category: 'Fashion' },
        { product: 'Phone', category: 'Electronics' },
      ];
      const semiCsv = jsonToCsv(data, { delimiter: ';' });
      expect(semiCsv).toContain('product;category');
      expect(semiCsv).toContain('Shoes;Fashion');

      const tsv = jsonToCsv(data, { delimiter: '\t' });
      expect(tsv).toContain('product\tcategory');

      const pipeCsv = jsonToCsv(data, { delimiter: '|' });
      expect(pipeCsv).toContain('product|category');
    });

    it('converts primitive arrays into indexed rows in CSV', () => {
      const data = ['First Item', 'Second Item', 'Third Item'];
      const csv = jsonToCsv(data);
      expect(csv).toContain('index,value');
      expect(csv).toContain('1,First Item');
      expect(csv).toContain('3,Third Item');
    });

    it('generates valid Excel SpreadsheetML XML (.xlsx)', () => {
      const data = [
        { Name: 'Laptop', Price: 999.99, InStock: 'Yes' },
        { Name: 'Mouse & Keyboard', Price: 49.5, InStock: 'No' },
      ];
      const xml = dataToSpreadsheetXml(data, 'Products');
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"');
      expect(xml).toContain('<Worksheet ss:Name="Products">');
      expect(xml).toContain('<Data ss:Type="String">Laptop</Data>');
      expect(xml).toContain('<Data ss:Type="Number">999.99</Data>');
      // Verify XML escaping of &
      expect(xml).toContain('Mouse &amp; Keyboard');
    });

    it('generates a clean styled HTML table page', () => {
      const data = [
        { ID: 101, Status: 'Active' },
        { ID: 102, Status: 'Pending' },
      ];
      const html = dataToHtmlTable(data, 'User List');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<h1>User List</h1>');
      expect(html).toContain('<th>ID</th>');
      expect(html).toContain('<th>Status</th>');
      expect(html).toContain('<td>101</td>');
      expect(html).toContain('<td>Active</td>');
    });

    it('zips multiple variable arrays into aligned rows', () => {
      const columns = [
        { header: 'Title', value: ['Product 1', 'Product 2', 'Product 3'] },
        { header: 'Price', value: ['$10', '$20', '$30'] },
        { header: 'Store', value: 'Amazon' }, // scalar value
      ];
      const zipped = zipVariablesToDataset(columns);
      expect(zipped).toHaveLength(3);
      expect(zipped[0]).toEqual({ Title: 'Product 1', Price: '$10', Store: 'Amazon' });
      expect(zipped[1]).toEqual({ Title: 'Product 2', Price: '$20', Store: 'Amazon' });
      expect(zipped[2]).toEqual({ Title: 'Product 3', Price: '$30', Store: 'Amazon' });
    });

    it('zips arrays of unequal length gracefully by padding with empty string', () => {
      const columns = [
        { header: 'Item', value: ['A', 'B', 'C'] },
        { header: 'Tag', value: ['Hot'] }, // shorter array
      ];
      const zipped = zipVariablesToDataset(columns);
      expect(zipped).toHaveLength(3);
      expect(zipped[0]).toEqual({ Item: 'A', Tag: 'Hot' });
      expect(zipped[1]).toEqual({ Item: 'B', Tag: '' });
      expect(zipped[2]).toEqual({ Item: 'C', Tag: '' });
    });

    it('parses JSON string arrays during zipping', () => {
      const columns = [
        { header: 'Names', value: '["Alice", "Bob"]' },
        { header: 'Scores', value: [95, 88] },
      ];
      const zipped = zipVariablesToDataset(columns);
      expect(zipped).toHaveLength(2);
      expect(zipped[0]).toEqual({ Names: 'Alice', Scores: 95 });
      expect(zipped[1]).toEqual({ Names: 'Bob', Scores: 88 });
    });

    it('createExportDocument formats all supported document types', () => {
      const dataset = [
        { ID: 1, Title: 'Task 1' },
        { ID: 2, Title: 'Task 2' },
      ];

      // CSV
      const csvDoc = createExportDocument(dataset, 'csv', { filename: 'my_tasks' });
      expect(csvDoc.format).toBe('csv');
      expect(csvDoc.filename).toBe('my_tasks.csv');
      expect(csvDoc.mimeType).toBe('text/csv');
      expect(csvDoc.rowCount).toBe(2);
      expect(csvDoc.columnCount).toBe(2);
      expect(csvDoc.dataUrl).toContain('data:text/csv');

      // XLSX
      const xlsxDoc = createExportDocument(dataset, 'xlsx', { filename: 'tasks' });
      expect(xlsxDoc.format).toBe('xlsx');
      expect(xlsxDoc.filename).toBe('tasks.xlsx');
      expect(xlsxDoc.mimeType).toBe('application/vnd.ms-excel');
      expect(xlsxDoc.content).toContain('<Workbook');

      // JSON
      const jsonDoc = createExportDocument(dataset, 'json', { filename: 'tasks' });
      expect(jsonDoc.format).toBe('json');
      expect(jsonDoc.filename).toBe('tasks.json');
      expect(JSON.parse(jsonDoc.content)).toEqual(dataset);

      // TSV
      const tsvDoc = createExportDocument(dataset, 'tsv', { filename: 'tasks' });
      expect(tsvDoc.format).toBe('tsv');
      expect(tsvDoc.filename).toBe('tasks.tsv');
      expect(tsvDoc.content).toContain('ID\tTitle');

      // HTML
      const htmlDoc = createExportDocument(dataset, 'html_table', { filename: 'tasks' });
      expect(htmlDoc.format).toBe('html_table');
      expect(htmlDoc.filename).toBe('tasks.html');
      expect(htmlDoc.content).toContain('<table>');
    });
  });

  describe('DOM Dataset Extraction', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('extracts multi-field dataset using container selector', async () => {
      document.body.innerHTML = `
        <div class="product-card">
          <h2 class="title">Wireless Earbuds</h2>
          <span class="price">$49.99</span>
          <a class="link" href="https://example.com/item1">View</a>
        </div>
        <div class="product-card">
          <h2 class="title">Mechanical Keyboard</h2>
          <span class="price">$119.00</span>
          <a class="link" href="https://example.com/item2">View</a>
        </div>
      `;

      const res = await extractDataset({
        containerSelector: '.product-card',
        fields: [
          { name: 'productName', selector: '.title' },
          { name: 'price', selector: '.price' },
          { name: 'url', selector: '.link', attribute: 'href' },
        ],
        timeout: 500,
      });

      expect(res.rowCount).toBe(2);
      expect(res.headers).toEqual(['productName', 'price', 'url']);
      expect(res.items[0]).toEqual({
        productName: 'Wireless Earbuds',
        price: '$49.99',
        url: 'https://example.com/item1',
      });
      expect(res.items[1]).toEqual({
        productName: 'Mechanical Keyboard',
        price: '$119.00',
        url: 'https://example.com/item2',
      });
    });

    it('extracts global fields and zips them when no container selector is provided', async () => {
      document.body.innerHTML = `
        <span class="city">New York</span>
        <span class="city">London</span>
        <span class="temp">22°C</span>
        <span class="temp">18°C</span>
      `;

      const res = await extractDataset({
        fields: [
          { name: 'City', selector: '.city' },
          { name: 'Temperature', selector: '.temp' },
        ],
        timeout: 500,
      });

      expect(res.rowCount).toBe(2);
      expect(res.items[0]).toEqual({ City: 'New York', Temperature: '22°C' });
      expect(res.items[1]).toEqual({ City: 'London', Temperature: '18°C' });
    });
  });

  describe('Runtime Executors: executeExportData', () => {
    const createMockContext = (initialVariables: Record<string, any> = {}): ExecutionContext => {
      const logs: any[] = [];
      const nodeStates: Record<string, any> = {};
      const variables = { ...initialVariables };

      return {
        variables,
        signal: new AbortController().signal,
        tabId: 1,
        isStepMode: false,
        log: (entry) => logs.push(entry),
        updateNodeState: (id, state) => {
          nodeStates[id] = { ...nodeStates[id], ...state };
        },
      };
    };

    it('exports dataset from variable into CSV and sets output variables', async () => {
      const ctx = createMockContext({
        leadsList: [
          { name: 'John Doe', email: 'john@example.com', role: 'CEO' },
          { name: 'Jane Smith', email: 'jane@example.com', role: 'CTO' },
        ],
      });

      const node: WorkflowNode = {
        id: 'export_node_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Export Leads',
          category: 'data',
          type: 'export_data',
          properties: {
            format: 'csv',
            sourceMode: 'variable',
            datasetVariable: 'leadsList',
            filename: 'leads_export',
            autoDownload: false,
            outputVariable: 'exportedLeads',
          },
        },
      };

      const result = await executeExportData(node, ctx);
      expect(result.success).toBe(true);
      expect(ctx.variables.exportedLeads).toHaveLength(2);
      expect(ctx.variables.exportedLeads_filename).toBe('leads_export.csv');
      expect(ctx.variables.exportedLeads_count).toBe(2);
      expect(ctx.variables.exportedLeads_content).toContain('name,email,role');
      expect(ctx.variables.exportedLeads_content).toContain('John Doe,john@example.com,CEO');
    });

    it('exports multiple variables by zipping them into Excel (.xlsx)', async () => {
      const ctx = createMockContext({
        itemTitles: ['Monitor', 'Headset'],
        itemPrices: [299, 79],
      });

      const node: WorkflowNode = {
        id: 'export_node_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Export Excel',
          category: 'data',
          type: 'export_data',
          properties: {
            format: 'xlsx',
            sourceMode: 'multiple_variables',
            columns: [
              { header: 'Product', value: '{{itemTitles}}' },
              { header: 'Price USD', value: '{{itemPrices}}' },
            ],
            filename: 'catalog',
            autoDownload: false,
            outputVariable: 'excelCatalog',
          },
        },
      };

      const result = await executeExportData(node, ctx);
      expect(result.success).toBe(true);
      expect(ctx.variables.excelCatalog).toHaveLength(2);
      expect(ctx.variables.excelCatalog_filename).toBe('catalog.xlsx');
      expect(ctx.variables.excelCatalog_content).toContain('<Workbook');
      expect(ctx.variables.excelCatalog_content).toContain('Monitor');
      expect(ctx.variables.excelCatalog_content).toContain('299');
    });

    it('direct export inside executeExtractMultiple when exportToFile is enabled', async () => {
      // Mock chrome.runtime.sendMessage to simulate extract_multiple DOM response
      (global as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            result: { items: ['Product Alpha', 'Product Beta', 'Product Gamma'] },
          }),
        },
        downloads: {
          download: vi.fn().mockResolvedValue(1001),
        },
      };

      const ctx = createMockContext();
      const node: WorkflowNode = {
        id: 'extract_mult_1',
        type: 'iteratorNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Extract Products',
          category: 'extraction',
          type: 'extract_multiple',
          properties: {
            selector: '.product-name',
            outputVariable: 'products',
            exportToFile: true,
            exportFormat: 'csv',
            exportFilename: 'products_direct',
          },
        },
      };

      const result = await executeExtractMultiple(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toHaveLength(3);
      expect(result.variables.products).toEqual(['Product Alpha', 'Product Beta', 'Product Gamma']);
      expect(result.variables.products_filename).toBe('products_direct.csv');
      expect(result.variables.products_dataUrl).toContain('data:text/csv');
    });
  });
});
