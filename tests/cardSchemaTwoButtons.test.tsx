import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { PropertiesPanel } from '../src/components/properties/PropertiesPanel';
import { WorkflowNode } from '../src/types/workflow';
import { buildElementSelectionResult } from '../src/selectors/generator';

describe('Card Schema - Two Dedicated Buttons & UI Streamlining', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  const mockNode: WorkflowNode = {
    id: 'node_scrape_1',
    type: 'customNode',
    position: { x: 100, y: 100 },
    data: {
      label: 'Scrape Products',
      type: 'scrape_elements',
      category: 'browser',
      properties: {
        containerSelector: 'article.Box-row',
        fields: [
          { name: 'repo_name', selector: 'h2 a', attribute: 'text' },
        ],
        cardHtmlSnippet: '<article class="Box-row"><h2><a href="/test">Repo</a></h2></article>',
        cardTagName: 'article',
      },
    },
  };

  it('renders two separate buttons: "Select Card Element" and "Generate with AI"', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleUpdateProperties = vi.fn();
    const handleStartElementPicker = vi.fn();
    const handleGenerateSchema = vi.fn();

    await React.act(async () => {
      root.render(
        React.createElement(PropertiesPanel, {
          selectedNode: mockNode,
          variables: {},
          onUpdateProperties: handleUpdateProperties,
          onUpdateLabel: vi.fn(),
          onToggleDisable: vi.fn(),
          onDeleteNode: vi.fn(),
          onRunSingleNode: vi.fn(),
          onStartElementPicker: handleStartElementPicker,
          onGenerateSchema: handleGenerateSchema,
          isPickingElement: false,
          isGeneratingSchema: false,
          onClose: vi.fn(),
        })
      );
    });

    // Verify both distinct buttons are present in the DOM
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Select Card Element')
    );
    expect(selectBtn).toBeDefined();

    const generateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Generate with AI')
    );
    expect(generateBtn).toBeDefined();

    // Verify HTML snippet status pill is shown
    expect(container.textContent).toContain('HTML Ready ✓');

    await React.act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('clicking "Select Card Element" triggers onStartElementPicker with card_container context', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleStartElementPicker = vi.fn();

    await React.act(async () => {
      root.render(
        React.createElement(PropertiesPanel, {
          selectedNode: mockNode,
          variables: {},
          onUpdateProperties: vi.fn(),
          onUpdateLabel: vi.fn(),
          onToggleDisable: vi.fn(),
          onDeleteNode: vi.fn(),
          onRunSingleNode: vi.fn(),
          onStartElementPicker: handleStartElementPicker,
          isPickingElement: false,
          isGeneratingSchema: false,
          onClose: vi.fn(),
        })
      );
    });

    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Select Card Element')
    );
    expect(selectBtn).toBeDefined();

    await React.act(async () => {
      selectBtn?.click();
    });

    expect(handleStartElementPicker).toHaveBeenCalledWith('single', 'card_container');

    await React.act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('clicking "Generate with AI" triggers onGenerateSchema callback', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleGenerateSchema = vi.fn().mockResolvedValue(undefined);

    await React.act(async () => {
      root.render(
        React.createElement(PropertiesPanel, {
          selectedNode: mockNode,
          variables: {},
          onUpdateProperties: vi.fn(),
          onUpdateLabel: vi.fn(),
          onToggleDisable: vi.fn(),
          onDeleteNode: vi.fn(),
          onRunSingleNode: vi.fn(),
          onStartElementPicker: vi.fn(),
          onGenerateSchema: handleGenerateSchema,
          isPickingElement: false,
          isGeneratingSchema: false,
          onClose: vi.fn(),
        })
      );
    });

    const generateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Generate with AI')
    );
    expect(generateBtn).toBeDefined();

    await React.act(async () => {
      generateBtn?.click();
    });

    expect(handleGenerateSchema).toHaveBeenCalledWith('node_scrape_1');

    await React.act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('buildElementSelectionResult selects repeating CSS class for card_container context', () => {
    const card = document.createElement('article');
    card.className = 'Box-row border-top';
    card.innerHTML = '<h2><a href="/owner/repo">Repo Name</a></h2>';
    document.body.appendChild(card);

    const res = buildElementSelectionResult(card, 'card_container');
    expect(res.selector).toContain('article.Box-row');
    expect(res.outerHtmlSnippet).toContain('Box-row');

    document.body.removeChild(card);
  });
});
