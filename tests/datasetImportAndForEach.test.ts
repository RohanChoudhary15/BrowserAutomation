import { describe, it, expect } from 'vitest';
import { parseCsv, parseJsonDataset } from '../src/utils/datasetImporter';
import { WorkflowEngine } from '../src/runtime/engine';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/types/workflow';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { IteratorNode } from '../src/nodes/IteratorNode';
import { ScraperNode } from '../src/nodes/ScraperNode';
import { LoopNode } from '../src/nodes/LoopNode';

describe('Dataset Importer & For Each Variable Exposing', () => {
  describe('parseCsv', () => {
    it('parses standard comma-separated CSV with headers and records', () => {
      const csv = `title,price,link
Product A,19.99,https://example.com/a
Product B,29.99,https://example.com/b`;

      const result = parseCsv(csv);
      expect(result.headers).toEqual(['title', 'price', 'link']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        title: 'Product A',
        price: 19.99,
        link: 'https://example.com/a',
      });
      expect(result.rows[1]).toEqual({
        title: 'Product B',
        price: 29.99,
        link: 'https://example.com/b',
      });
    });

    it('handles quoted fields with commas and escaped quotes', () => {
      const csv = `name,"desc, with comma",rating
"Laptop ""Pro""",fast and sleek,4.8`;

      const result = parseCsv(csv);
      expect(result.headers).toEqual(['name', 'desc, with comma', 'rating']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Laptop "Pro"');
      expect(result.rows[0]['desc, with comma']).toBe('fast and sleek');
      expect(result.rows[0].rating).toBe(4.8);
    });

    it('auto-detects tab and semicolon delimiters', () => {
      const tsv = `id\tname\tcategory\n1\tItem 1\tGadgets\n2\tItem 2\tTools`;
      const result = parseCsv(tsv);
      expect(result.headers).toEqual(['id', 'name', 'category']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].id).toBe(1);
      expect(result.rows[0].name).toBe('Item 1');
    });

    it('strips UTF-8 BOM if present', () => {
      const bomCsv = '\uFEFFcol1,col2\nval1,val2';
      const result = parseCsv(bomCsv);
      expect(result.headers).toEqual(['col1', 'col2']);
      expect(result.rows[0]).toEqual({ col1: 'val1', col2: 'val2' });
    });
  });

  describe('parseJsonDataset', () => {
    it('parses array of objects', () => {
      const json = JSON.stringify([
        { title: 'Item 1', price: '$10', inStock: true },
        { title: 'Item 2', price: '$20', inStock: false },
      ]);
      const result = parseJsonDataset(json);
      expect(result.headers).toEqual(['title', 'price', 'inStock']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].title).toBe('Item 1');
    });

    it('parses object with wrapped items or data array', () => {
      const json = JSON.stringify({
        items: [
          { sku: 'ABC', quantity: 5 },
          { sku: 'XYZ', quantity: 10 },
        ],
      });
      const result = parseJsonDataset(json);
      expect(result.headers).toEqual(['sku', 'quantity']);
      expect(result.rows).toHaveLength(2);
    });

    it('parses single object into single row', () => {
      const json = JSON.stringify({ title: 'Single Item', price: 99 });
      const result = parseJsonDataset(json);
      expect(result.headers).toEqual(['title', 'price']);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe('WorkflowEngine For Each Variable Exposing by Column Names', () => {
    it('exposes direct variables for each column name during loop execution', async () => {
      const testItems = [
        { productTitle: 'Wireless Headphones', price: 49.99, brand: 'Sony' },
        { productTitle: 'Bluetooth Speaker', price: 29.99, brand: 'JBL' },
      ];

      const capturedIterations: Record<string, any>[] = [];

      const forEachNode: WorkflowNode = {
        id: 'node_loop',
        type: 'for_each',
        position: { x: 0, y: 0 },
        data: {
          label: 'For Each Product',
          type: 'for_each',
          category: 'control_flow',
          properties: {
            array: '{{products}}',
            itemVariable: 'product',
          },
        },
      };

      const customBodyNode: WorkflowNode = {
        id: 'node_body',
        type: 'customNode',
        position: { x: 0, y: 100 },
        data: {
          label: 'Capture Body',
          type: 'set_variable',
          category: 'data',
          properties: {
            name: 'lastProduct',
            value: '{{productTitle}}',
          },
        },
      };

      const edges: WorkflowEdge[] = [
        {
          id: 'edge_body',
          source: 'node_loop',
          target: 'node_body',
          sourceHandle: 'loop_body',
        },
      ];

      const workflow: Workflow = {
        id: 'wf_test',
        name: 'Test Workflow',
        nodes: [forEachNode, customBodyNode],
        edges,
        variables: {
          products: testItems,
        },
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      };

      let lastIndex = -1;
      const engine = new WorkflowEngine(workflow, {
        onVariablesChange: (vars) => {
          if (vars.productTitle && vars.index !== lastIndex) {
            lastIndex = vars.index;
            capturedIterations.push({
              productTitle: vars.productTitle,
              price: vars.price,
              brand: vars.brand,
              scoped_productTitle: vars['product.productTitle'],
              item_productTitle: vars['item.productTitle'],
              itemVar: vars.product,
            });
          }
        },
      });

      await engine.run();
      expect(capturedIterations).toHaveLength(2);

      // Verify direct column variable names
      expect(capturedIterations[0].productTitle).toBe('Wireless Headphones');
      expect(capturedIterations[0].price).toBe(49.99);
      expect(capturedIterations[0].brand).toBe('Sony');
      expect(capturedIterations[0].scoped_productTitle).toBe('Wireless Headphones');
      expect(capturedIterations[0].item_productTitle).toBe('Wireless Headphones');
      expect(capturedIterations[0].itemVar).toEqual(testItems[0]);

      expect(capturedIterations[1].productTitle).toBe('Bluetooth Speaker');
      expect(capturedIterations[1].price).toBe(29.99);
      expect(capturedIterations[1].brand).toBe('JBL');
    });

    it('loops over node.data.properties.importedItems directly if array is not in context', async () => {
      const importedDataset = [
        { name: 'Row 1', score: 100 },
        { name: 'Row 2', score: 95 },
      ];

      const capturedRows: any[] = [];

      const forEachNode: WorkflowNode = {
        id: 'node_loop_imported',
        type: 'for_each',
        position: { x: 0, y: 0 },
        data: {
          label: 'For Each Imported',
          type: 'for_each',
          category: 'control_flow',
          properties: {
            array: 'importedItems',
            importedItems: importedDataset,
            itemVariable: 'entry',
          },
        },
      };

      const bodyNode: WorkflowNode = {
        id: 'node_capture',
        type: 'customNode',
        position: { x: 0, y: 100 },
        data: {
          label: 'Capture Row',
          type: 'set_variable',
          category: 'data',
          properties: {
            name: 'lastRow',
            value: '{{name}}',
          },
        },
      };

      const edges: WorkflowEdge[] = [
        {
          id: 'edge_b',
          source: 'node_loop_imported',
          target: 'node_capture',
          sourceHandle: 'loop_body',
        },
      ];

      const workflow: Workflow = {
        id: 'wf_imported',
        name: 'Imported Workflow',
        nodes: [forEachNode, bodyNode],
        edges,
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      };

      let lastRowIndex = -1;
      const engine = new WorkflowEngine(workflow, {
        onVariablesChange: (vars) => {
          if (vars.name && vars.index !== lastRowIndex) {
            lastRowIndex = vars.index;
            capturedRows.push({
              name: vars.name,
              score: vars.score,
              scoped: vars['entry.name'],
            });
          }
        },
      });

      await engine.run();
      expect(capturedRows).toHaveLength(2);
      expect(capturedRows[0].name).toBe('Row 1');
      expect(capturedRows[0].score).toBe(100);
      expect(capturedRows[0].scoped).toBe('Row 1');
      expect(capturedRows[1].name).toBe('Row 2');
    });
  });

  describe('Canvas Node Cards UI: Import Button & Draggable For Each Card', () => {
    it('renders IteratorNode with Import button and Draggable For Each Loop card', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await React.act(async () => {
        root.render(
          React.createElement(
            ReactFlowProvider,
            null,
            React.createElement(IteratorNode, {
              id: 'iter-node-1',
              selected: false,
              type: 'scrape_elements',
              zIndex: 1,
              isConnectable: true,
              positionAbsoluteX: 0,
              positionAbsoluteY: 0,
              dragging: false,
              data: {
                label: 'Scrape Products',
                type: 'scrape_elements',
                category: 'extraction',
                properties: {
                  outputVariable: 'scrapedProducts',
                  fields: [{ name: 'title' }, { name: 'price' }, { name: 'rating' }],
                  importedItems: [{ title: 'Phone', price: '$299', rating: '4.5' }],
                  importedHeaders: ['title', 'price', 'rating'],
                },
              },
            })
          )
        );
      });

      expect(container).toBeDefined();
      expect(container.innerHTML).toContain('Drag "For Each" Loop');
      expect(container.innerHTML).toContain('scrapedProducts');
      expect(container.innerHTML).toContain('title');
      expect(container.innerHTML).toContain('price');
      expect(container.innerHTML).toContain('Import');
    });

    it('renders ScraperNode with Import button and Draggable For Each Loop card', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await React.act(async () => {
        root.render(
          React.createElement(
            ReactFlowProvider,
            null,
            React.createElement(ScraperNode, {
              id: 'scraper-node-1',
              selected: false,
              type: 'amazon_scraper',
              zIndex: 1,
              isConnectable: true,
              positionAbsoluteX: 0,
              positionAbsoluteY: 0,
              dragging: false,
              data: {
                label: 'Amazon Scraper',
                type: 'amazon_scraper',
                category: 'extraction',
                properties: {
                  outputVariable: 'amazonProducts',
                  importedItems: [{ title: 'Keyboard', price: '$49', asin: 'B001' }],
                  importedHeaders: ['title', 'price', 'asin'],
                },
              },
            })
          )
        );
      });

      expect(container).toBeDefined();
      expect(container.innerHTML).toContain('Drag "For Each" Loop');
      expect(container.innerHTML).toContain('amazonProducts');
      expect(container.innerHTML).toContain('title');
      expect(container.innerHTML).toContain('price');
      expect(container.innerHTML).toContain('asin');
      expect(container.innerHTML).toContain('Import');
    });

    it('renders LoopNode for for_each with exposed variables and Import button', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await React.act(async () => {
        root.render(
          React.createElement(
            ReactFlowProvider,
            null,
            React.createElement(LoopNode, {
              id: 'loop-node-1',
              selected: false,
              type: 'for_each',
              zIndex: 1,
              isConnectable: true,
              positionAbsoluteX: 0,
              positionAbsoluteY: 0,
              dragging: false,
              data: {
                label: 'For Each Loop',
                type: 'for_each',
                category: 'control_flow',
                properties: {
                  array: '{{scrapedProducts}}',
                  exposedVariables: ['title', 'price', 'link'],
                },
              },
            })
          )
        );
      });

      expect(container).toBeDefined();
      expect(container.innerHTML).toContain('Exposed Variables:');
      expect(container.innerHTML).toContain('title');
      expect(container.innerHTML).toContain('price');
      expect(container.innerHTML).toContain('link');
      expect(container.innerHTML).toContain('Import CSV / JSON to Loop');
    });
  });
});
