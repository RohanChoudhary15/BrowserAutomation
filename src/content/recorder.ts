import { buildElementSelectionResult } from '../selectors/generator';
import { RecordedActionPayload } from '../types/messages';

let isRecording = false;
let onActionCallback: ((action: RecordedActionPayload) => void) | null = null;

// Debounce state for typing
let typingTimer: any = null;
let currentTypingSelector = '';
let accumulatedText = '';

function flushTyping() {
  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }
  if (currentTypingSelector && accumulatedText) {
    onActionCallback?.({
      type: 'type_text',
      timestamp: Date.now(),
      properties: {
        selector: currentTypingSelector,
        text: accumulatedText,
        clearExisting: true,
      },
    });
    currentTypingSelector = '';
    accumulatedText = '';
  }
}

function handleRecorderClick(e: MouseEvent) {
  if (!isRecording) return;
  const target = e.target as Element | null;
  if (!target || target.closest('.autoflow-recorder-ui')) return;

  // Flush any pending typing before recording a click
  flushTyping();

  const selection = buildElementSelectionResult(target);
  const clickType = e.button === 2 ? 'right' : 'left';

  onActionCallback?.({
    type: 'click',
    timestamp: Date.now(),
    properties: {
      selector: selection.selector,
      clickType,
    },
  });
}

function handleRecorderInput(e: Event) {
  if (!isRecording) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target) return;

  const selection = buildElementSelectionResult(target);
  const currentSelector = selection.selector;

  if (currentTypingSelector !== currentSelector) {
    flushTyping();
    currentTypingSelector = currentSelector;
  }

  accumulatedText = target.value;

  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    flushTyping();
  }, 600);
}

function handleRecorderChange(e: Event) {
  if (!isRecording) return;
  const target = e.target as HTMLSelectElement | null;
  if (target && target instanceof HTMLSelectElement) {
    flushTyping();
    const selection = buildElementSelectionResult(target);
    onActionCallback?.({
      type: 'select_dropdown',
      timestamp: Date.now(),
      properties: {
        selector: selection.selector,
        selectionType: 'value',
        value: target.value,
        label: target.options[target.selectedIndex]?.text,
      },
    });
  }
}

function handleRecorderKeyDown(e: KeyboardEvent) {
  if (!isRecording) return;
  // Record special navigation/action keys like Enter, Tab, Escape
  if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
    flushTyping();
    const target = e.target as Element | null;
    const selector = target ? buildElementSelectionResult(target).selector : undefined;

    onActionCallback?.({
      type: 'press_key',
      timestamp: Date.now(),
      properties: {
        key: e.key,
        selector,
      },
    });
  }
}

export function startActionRecorder(onAction: (action: RecordedActionPayload) => void) {
  if (isRecording) return;
  isRecording = true;
  onActionCallback = onAction;

  document.addEventListener('click', handleRecorderClick, true);
  document.addEventListener('input', handleRecorderInput, true);
  document.addEventListener('change', handleRecorderChange, true);
  document.addEventListener('keydown', handleRecorderKeyDown, true);
}

export function stopActionRecorder() {
  if (!isRecording) return;
  flushTyping();
  isRecording = false;

  document.removeEventListener('click', handleRecorderClick, true);
  document.removeEventListener('input', handleRecorderInput, true);
  document.removeEventListener('change', handleRecorderChange, true);
  document.removeEventListener('keydown', handleRecorderKeyDown, true);

  onActionCallback = null;
}
