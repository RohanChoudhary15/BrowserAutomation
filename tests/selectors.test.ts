import { describe, it, expect, beforeEach } from 'vitest';
import { generateSelectors, isDynamicId, buildElementSelectionResult } from '../src/selectors/generator';

describe('Selector Generator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects dynamic vs stable IDs', () => {
    expect(isDynamicId('btn-submit')).toBe(false);
    expect(isDynamicId('user_login_form')).toBe(false);

    expect(isDynamicId(':r1:')).toBe(true);
    expect(isDynamicId('react-aria-182937')).toBe(true);
    expect(isDynamicId('ember4920')).toBe(true);
    expect(isDynamicId('12345')).toBe(true);
    expect(isDynamicId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  it('prioritizes data-testid attribute', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'submit-order-btn');
    btn.setAttribute('id', 'btn-123');
    btn.textContent = 'Submit Order';
    document.body.appendChild(btn);

    const strategies = generateSelectors(btn);
    expect(strategies[0].type).toBe('testid');
    expect(strategies[0].value).toBe('[data-testid="submit-order-btn"]');
  });

  it('generates stable ID when available', () => {
    const input = document.createElement('input');
    input.setAttribute('id', 'username-field');
    document.body.appendChild(input);

    const strategies = generateSelectors(input);
    const idStrategy = strategies.find(s => s.type === 'id');
    expect(idStrategy).toBeDefined();
    expect(idStrategy?.value).toBe('#username-field');
  });

  it('generates text content selector for buttons and links', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Confirm Purchase';
    document.body.appendChild(btn);

    const strategies = generateSelectors(btn);
    const textStrategy = strategies.find(s => s.type === 'text');
    expect(textStrategy).toBeDefined();
    expect(textStrategy?.value).toBe('button:has-text("Confirm Purchase")');
  });

  it('builds full ElementSelectionResult', () => {
    const div = document.createElement('div');
    div.setAttribute('aria-label', 'Main Navigation');
    document.body.appendChild(div);

    const res = buildElementSelectionResult(div);
    expect(res.tagName).toBe('div');
    expect(res.ariaLabel).toBe('Main Navigation');
    expect(res.strategies.length).toBeGreaterThan(0);
  });

  describe('queryElement with compound :has-text', () => {
    it('matches compound selectors with :has-text("...")', async () => {
      const { queryElement } = await import('../src/selectors/finder');
      const container = document.createElement('div');
      container.className = 'modal-dialog';
      const btn = document.createElement('button');
      btn.className = 'btn-retry primary';
      btn.textContent = 'Retry Connection';
      container.appendChild(btn);
      document.body.appendChild(container);

      const found = queryElement('button.btn-retry:has-text("Retry Connection")');
      expect(found).toBe(btn);

      const foundCaseInsensitive = queryElement('button:has-text("retry connection")');
      expect(foundCaseInsensitive).toBe(btn);

      const foundPartial = queryElement('button.btn-retry:has-text("Retry")');
      expect(foundPartial).toBe(btn);
    });
  });
});
