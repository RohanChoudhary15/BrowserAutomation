import { describe, it, expect, vi } from 'vitest';
import {
  combineDatasets,
  CombineDatasetsOptions,
  ColumnMapping,
} from '../src/utils/datasetCombiner';
import { executeCombineDatasets } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('Combine Datasets Utility & Executor', () => {
  const datasetA = [
    { title: 'Mechanical Keyboard', price: '$99.99', url: 'https://example.com/p1?ref=promo' },
    { title: 'Wireless Mouse', price: '$49.99', url: 'https://example.com/p2' },
  ];

  const datasetB = [
    { title: 'Mechanical Keyboard', inStock: true, rating: 4.8, url: 'https://example.com/p1' },
    { title: 'Gaming Headset', price: '$79.99', inStock: false, url: 'https://example.com/p3' },
  ];

  it('combines datasets using union mode with schema expansion', () => {
    const result = combineDatasets([datasetA, datasetB], {
      mode: 'union',
      deduplicate: false,
      addSourceColumn: true,
    });

    expect(result.rowCount).toBe(4);
    // Columns should include columns from both datasets plus _source
    expect(result.columns).toContain('title');
    expect(result.columns).toContain('price');
    expect(result.columns).toContain('inStock');
    expect(result.columns).toContain('rating');
    expect(result.columns).toContain('_source');

    // Missing values should be empty string
    expect(result.items[0].inStock).toBe('');
    expect(result.items[2].price).toBe('');
  });

  it('combines datasets using intersection mode (common columns only)', () => {
    const result = combineDatasets([datasetA, datasetB], {
      mode: 'intersection',
      deduplicate: false,
      addSourceColumn: false,
    });

    // Only 'title' and 'url' are present in both datasetA and datasetB
    expect(result.columns).toEqual(expect.arrayContaining(['title', 'url']));
    expect(result.columns).not.toContain('inStock');
    expect(result.columns).not.toContain('rating');
    expect(result.rowCount).toBe(4);
  });

  it('merges matching records using key_join mode', () => {
    const result = combineDatasets([datasetA, datasetB], {
      mode: 'key_join',
      primaryKey: 'title',
      addSourceColumn: false,
    });

    expect(result.rowCount).toBe(3);
    const keyboard = result.items.find((i) => i.title === 'Mechanical Keyboard');
    expect(keyboard).toBeDefined();
    expect(keyboard.price).toBe('$99.99');
    expect(keyboard.inStock).toBe(true);
    expect(keyboard.rating).toBe(4.8);
  });

  it('applies column mappings across datasets', () => {
    const datasetWithDifferentNames = [
      { product_name: 'Monitor Stand', cost: '$29.99' },
    ];

    const mappings: ColumnMapping[] = [
      { sourceColumn: 'product_name', targetColumn: 'title' },
      { sourceColumn: 'cost', targetColumn: 'price' },
    ];

    const result = combineDatasets([datasetA, datasetWithDifferentNames], {
      columnMappings: mappings,
      deduplicate: false,
      addSourceColumn: false,
    });

    expect(result.columns).toContain('title');
    expect(result.columns).toContain('price');
    const stand = result.items.find((i) => i.title === 'Monitor Stand');
    expect(stand).toBeDefined();
    expect(stand.price).toBe('$29.99');
  });

  it('deduplicates with merge_coalesce strategy and URL normalization', () => {
    const result = combineDatasets([datasetA, datasetB], {
      deduplicate: true,
      dedupKeys: ['url'],
      dedupStrategy: 'merge_coalesce',
      normalizeUrls: true,
      addSourceColumn: false,
    });

    // p1 in datasetA (with ?ref=promo) and p1 in datasetB normalize to same URL
    expect(result.rowCount).toBe(3);
    expect(result.duplicatesRemoved).toBe(1);

    const mergedP1 = result.items.find((i) => i.url.includes('/p1'));
    expect(mergedP1).toBeDefined();
    // Coalesce merges fields from both sources:
    expect(mergedP1.price).toBe('$99.99');
    expect(mergedP1.inStock).toBe(true);
    expect(mergedP1.rating).toBe(4.8);
  });

  it('deduplicates with highest_completeness strategy', () => {
    const partialItem = [{ id: '101', name: 'Item', desc: '' }];
    const completeItem = [{ id: '101', name: 'Item', desc: 'Full detailed description', tag: 'v2' }];

    const result = combineDatasets([partialItem, completeItem], {
      deduplicate: true,
      dedupKeys: ['id'],
      dedupStrategy: 'highest_completeness',
      addSourceColumn: false,
    });

    expect(result.rowCount).toBe(1);
    expect(result.items[0].desc).toBe('Full detailed description');
    expect(result.items[0].tag).toBe('v2');
  });

  it('executes combine_datasets node via executeCombineDatasets executor', async () => {
    const node: WorkflowNode = {
      id: 'combine_node_1',
      type: 'combine_datasets',
      position: { x: 0, y: 0 },
      data: {
        label: 'Combine Scrapes',
        type: 'combine_datasets',
        properties: {
          sourceMode: 'variables',
          sourceVariables: ['scrape1', 'scrape2'],
          mode: 'union',
          deduplicate: true,
          dedupStrategy: 'merge_coalesce',
          outputVariable: 'allProducts',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: {
        scrape1: [{ title: 'Alpha', price: 10 }],
        scrape2: [{ title: 'Beta', price: 20 }, { title: 'Alpha', price: 10, rating: 5 }],
      },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeCombineDatasets(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.allProducts).toBeDefined();
    expect(ctx.variables.allProducts.length).toBe(2); // Alpha deduplicated
    expect(ctx.variables.allProducts_count).toBe(2);
    expect(ctx.variables.allProducts[0].title).toBe('Alpha');
    expect(ctx.variables.allProducts[0].rating).toBe(5); // Merged coalesce
  });
});
