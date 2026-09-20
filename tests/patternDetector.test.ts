import { describe, it, expect, beforeEach } from 'vitest';
import {
  findLowestCommonAncestor,
  detectListPattern,
  getRelativeSelector,
} from '../src/selectors/patternDetector';

describe('Visual 2-Click Pattern Detection Engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('findLowestCommonAncestor', () => {
    it('returns null if either element is null', () => {
      const el = document.createElement('div');
      expect(findLowestCommonAncestor(null, el)).toBeNull();
      expect(findLowestCommonAncestor(el, null)).toBeNull();
    });

    it('returns the shared parent container of two sibling elements', () => {
      const container = document.createElement('div');
      container.id = 'container';
      const item1 = document.createElement('div');
      item1.className = 'item';
      const item2 = document.createElement('div');
      item2.className = 'item';

      container.appendChild(item1);
      container.appendChild(item2);
      document.body.appendChild(container);

      const lca = findLowestCommonAncestor(item1, item2);
      expect(lca).toBe(container);
    });

    it('returns the higher shared ancestor when items are nested at varying depths', () => {
      const root = document.createElement('section');
      const branchA = document.createElement('div');
      const leafA = document.createElement('span');
      branchA.appendChild(leafA);

      const branchB = document.createElement('div');
      const subBranchB = document.createElement('p');
      const leafB = document.createElement('span');
      subBranchB.appendChild(leafB);
      branchB.appendChild(subBranchB);

      root.appendChild(branchA);
      root.appendChild(branchB);
      document.body.appendChild(root);

      const lca = findLowestCommonAncestor(leafA, leafB);
      expect(lca).toBe(root);
    });
  });

  describe('detectListPattern', () => {
    it('discovers repeating list items in an unordered list', () => {
      const ul = document.createElement('ul');
      ul.className = 'item-list';
      for (let i = 1; i <= 6; i++) {
        const li = document.createElement('li');
        li.className = 'product-row';
        li.textContent = `Product item ${i}`;
        ul.appendChild(li);
      }
      document.body.appendChild(ul);

      const item1 = ul.children[0] as HTMLElement;
      const item2 = ul.children[1] as HTMLElement;

      const result = detectListPattern(item1, item2);
      expect(result).not.toBeNull();
      expect(result?.matchCount).toBe(6);
      expect(result?.itemSelector).toContain('product-row');
      expect(result?.confidence).toBeGreaterThan(0.7);
    });

    it('discovers repeating rows in a table', () => {
      const table = document.createElement('table');
      table.className = 'data-table';
      const tbody = document.createElement('tbody');

      for (let i = 1; i <= 8; i++) {
        const tr = document.createElement('tr');
        tr.className = 'data-row';
        const td1 = document.createElement('td');
        td1.textContent = `Row ${i} Col A`;
        const td2 = document.createElement('td');
        td2.textContent = `Row ${i} Col B`;
        tr.appendChild(td1);
        tr.appendChild(td2);
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      document.body.appendChild(table);

      const item1 = tbody.children[0] as HTMLElement;
      const item2 = tbody.children[1] as HTMLElement;

      const result = detectListPattern(item1, item2);
      expect(result).not.toBeNull();
      expect(result?.matchCount).toBe(8);
      expect(result?.matchedElements.length).toBe(8);
    });

    it('identifies sub-element patterns like title links inside product cards', () => {
      const grid = document.createElement('div');
      grid.className = 'products-grid';

      for (let i = 1; i <= 5; i++) {
        const card = document.createElement('article');
        card.className = 'product-card';

        const h3 = document.createElement('h3');
        const link = document.createElement('a');
        link.className = 'product-title';
        link.textContent = `Mechanical Keyboard Model ${i}`;
        h3.appendChild(link);

        const price = document.createElement('span');
        price.className = 'price';
        price.textContent = `$${99 + i}`;

        card.appendChild(h3);
        card.appendChild(price);
        grid.appendChild(card);
      }
      document.body.appendChild(grid);

      const link1 = grid.querySelectorAll('.product-title')[0] as HTMLElement;
      const link2 = grid.querySelectorAll('.product-title')[1] as HTMLElement;

      const result = detectListPattern(link1, link2);
      expect(result).not.toBeNull();
      expect(result?.matchCount).toBe(5);
      expect(result?.sampleTexts[0]).toContain('Mechanical Keyboard Model 1');
      expect(result?.sampleTexts[1]).toContain('Mechanical Keyboard Model 2');
    });

    it('handles identical element clicks gracefully with fallback', () => {
      const card = document.createElement('div');
      card.className = 'single-card';
      document.body.appendChild(card);

      const result = detectListPattern(card, card);
      expect(result).not.toBeNull();
      expect(result?.matchCount).toBe(1);
    });
  });

  describe('getRelativeSelector', () => {
    it('generates a relative selector from ancestor to descendant', () => {
      const root = document.createElement('div');
      const child = document.createElement('h4');
      child.className = 'card-title';
      root.appendChild(child);

      const rel = getRelativeSelector(root, child);
      expect(rel).toBe('h4.card-title');
    });
  });
});
