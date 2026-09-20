import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setNativeInputValue,
  resolveTargetInputElement,
  clearElementValue,
  performRobustTyping,
  typeText,
  typeIntoElement,
  getInteractiveElementsSnapshot,
} from '../src/content/domActions';

describe('Robust Typing Engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('resolveTargetInputElement', () => {
    it('returns direct HTMLInputElement or HTMLTextAreaElement', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      document.body.appendChild(input);
      document.body.appendChild(textarea);

      expect(resolveTargetInputElement(input)).toBe(input);
      expect(resolveTargetInputElement(textarea)).toBe(textarea);
    });

    it('unwraps container div to find inner input', () => {
      const container = document.createElement('div');
      container.className = 'search-bar-wrapper';
      const innerInput = document.createElement('input');
      innerInput.type = 'search';
      container.appendChild(innerInput);
      document.body.appendChild(container);

      expect(resolveTargetInputElement(container)).toBe(innerInput);
    });

    it('resolves label with htmlFor attribute to linked input', () => {
      const label = document.createElement('label');
      label.htmlFor = 'user-email';
      const input = document.createElement('input');
      input.id = 'user-email';
      document.body.appendChild(label);
      document.body.appendChild(input);

      expect(resolveTargetInputElement(label)).toBe(input);
    });

    it('resolves contenteditable div and role="textbox"', () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      const roleBox = document.createElement('div');
      roleBox.setAttribute('role', 'textbox');
      document.body.appendChild(editor);
      document.body.appendChild(roleBox);

      expect(resolveTargetInputElement(editor)).toBe(editor);
      expect(resolveTargetInputElement(roleBox)).toBe(roleBox);
    });

    it('resolves role="combobox" and role="searchbox"', () => {
      const combo = document.createElement('div');
      combo.setAttribute('role', 'combobox');
      const searchBox = document.createElement('div');
      searchBox.setAttribute('role', 'searchbox');
      document.body.appendChild(combo);
      document.body.appendChild(searchBox);

      expect(resolveTargetInputElement(combo)).toBe(combo);
      expect(resolveTargetInputElement(searchBox)).toBe(searchBox);
    });
  });

  describe('setNativeInputValue & React _valueTracker', () => {
    it('sets input value and updates React _valueTracker', () => {
      const input = document.createElement('input');
      let trackerValue = '';
      (input as any)._valueTracker = {
        setValue: vi.fn((val: string) => {
          trackerValue = val;
        }),
      };
      document.body.appendChild(input);

      setNativeInputValue(input, 'React Controlled Value');
      expect(input.value).toBe('React Controlled Value');
      expect((input as any)._valueTracker.setValue).toHaveBeenCalledWith('React Controlled Value');
      expect(trackerValue).toBe('React Controlled Value');
    });

    it('sets textarea value properly', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      setNativeInputValue(textarea, 'Multiline\nText');
      expect(textarea.value).toBe('Multiline\nText');
    });
  });

  describe('clearElementValue', () => {
    it('clears HTMLInputElement and dispatches input and change events', () => {
      const input = document.createElement('input');
      input.value = 'Pre-existing text';
      document.body.appendChild(input);

      let inputDispatched = false;
      let changeDispatched = false;
      input.addEventListener('input', () => { inputDispatched = true; });
      input.addEventListener('change', () => { changeDispatched = true; });

      clearElementValue(input);
      expect(input.value).toBe('');
      expect(inputDispatched).toBe(true);
      expect(changeDispatched).toBe(true);
    });

    it('clears contenteditable elements', () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      editor.textContent = 'Existing rich text';
      document.body.appendChild(editor);

      clearElementValue(editor);
      expect(editor.textContent).toBe('');
    });
  });

  describe('performRobustTyping', () => {
    it('types character-by-character and triggers events in HTMLInputElement', async () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      const events: string[] = [];
      input.addEventListener('keydown', (e) => events.push(`down:${e.key}`));
      input.addEventListener('input', (e) => events.push(`input:${(e as InputEvent).data}`));
      input.addEventListener('keyup', (e) => events.push(`up:${e.key}`));
      input.addEventListener('change', () => events.push('change'));

      const res = await performRobustTyping(input, 'cat', { clearFirst: true });
      expect(res.success).toBe(true);
      expect(input.value).toBe('cat');

      expect(events).toContain('down:c');
      expect(events).toContain('input:c');
      expect(events).toContain('up:c');
      expect(events).toContain('down:a');
      expect(events).toContain('down:t');
      expect(events).toContain('change');
    });

    it('types into contenteditable element', async () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      document.body.appendChild(editor);

      const res = await performRobustTyping(editor, 'Rich editor content', { clearFirst: true });
      expect(res.success).toBe(true);
      expect(editor.textContent).toContain('Rich editor content');
    });

    it('handles pressEnter and clicks form submit button', async () => {
      const form = document.createElement('form');
      const input = document.createElement('input');
      const submitBtn = document.createElement('button');
      submitBtn.type = 'submit';

      form.appendChild(input);
      form.appendChild(submitBtn);
      document.body.appendChild(form);

      let submitClicked = false;
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        submitClicked = true;
      });

      await performRobustTyping(input, 'Query', { pressEnter: true });
      expect(submitClicked).toBe(true);
    });
  });

  describe('typeIntoElement with wrapper target', () => {
    it('automatically targets inner input when wrapper div selector is passed', async () => {
      const wrapper = document.createElement('div');
      wrapper.id = 'search-container';
      const input = document.createElement('input');
      input.id = 'actual-search-input';
      wrapper.appendChild(input);
      document.body.appendChild(wrapper);

      const res = await typeIntoElement({
        selector: '#search-container',
        text: 'Automated search query',
        clearFirst: true,
      });

      expect(res.success).toBe(true);
      expect(input.value).toBe('Automated search query');
    });
  });

  describe('getInteractiveElementsSnapshot selector generation', () => {
    it('generates high quality selectors using name and placeholder', () => {
      const inputName = document.createElement('input');
      inputName.name = 'search_keyword';
      inputName.getBoundingClientRect = () => ({
        top: 10, left: 10, width: 200, height: 40, right: 210, bottom: 50, x: 10, y: 10, toJSON: () => {},
      });
      document.body.appendChild(inputName);

      const textarea = document.createElement('textarea');
      textarea.setAttribute('placeholder', 'Enter feedback here...');
      textarea.getBoundingClientRect = () => ({
        top: 60, left: 10, width: 200, height: 100, right: 210, bottom: 160, x: 10, y: 60, toJSON: () => {},
      });
      document.body.appendChild(textarea);

      const snapshot = getInteractiveElementsSnapshot();
      const inputItem = snapshot.find(s => s.tag === 'input');
      const textareaItem = snapshot.find(s => s.tag === 'textarea');

      expect(inputItem?.selector).toBe('input[name="search_keyword"]');
      expect(textareaItem?.selector).toBe('textarea[placeholder="Enter feedback here..."]');
    });
  });

  describe('Special Input Types and Click Retry', () => {
    it('successfully types into type="number" and type="email" inputs without throwing InvalidStateError', async () => {
      const numberInput = document.createElement('input');
      numberInput.type = 'number';
      // Simulate Chrome throwing InvalidStateError on selectionStart access for type="number"
      Object.defineProperty(numberInput, 'selectionStart', {
        get: () => {
          throw new DOMException("The input element's type ('number') does not support selection.", 'InvalidStateError');
        },
      });
      document.body.appendChild(numberInput);

      const res = await performRobustTyping(numberInput, '42', { clearFirst: true });
      expect(res.success).toBe(true);
      expect(numberInput.value).toBe('42');
    });

    it('clickElement retries and succeeds when element becomes available', async () => {
      const { clickElement } = await import('../src/content/domActions');
      const btn = document.createElement('button');
      btn.id = 'delayed-retry-btn';
      btn.textContent = 'Retry Request';

      let clicked = false;
      btn.addEventListener('click', () => {
        clicked = true;
      });

      // Append element after a short delay (200ms)
      setTimeout(() => {
        document.body.appendChild(btn);
      }, 200);

      const res = await clickElement('#delayed-retry-btn', { timeout: 2000, retries: 2 });
      expect(res.success).toBe(true);
      expect(clicked).toBe(true);
    });
  });
});
