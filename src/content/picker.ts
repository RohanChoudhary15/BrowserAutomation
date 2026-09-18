import { buildElementSelectionResult } from '../selectors/generator';
import { ElementSelectionResult } from '../types/selector';

let overlayEl: HTMLDivElement | null = null;
let badgeEl: HTMLDivElement | null = null;
let bannerEl: HTMLDivElement | null = null;
let hoveredElement: Element | null = null;
let isPickerActive = false;

type PickCallback = (result: ElementSelectionResult) => void;
type CancelCallback = () => void;

let onPickCallback: PickCallback | null = null;
let onCancelCallback: CancelCallback | null = null;

function handleMouseMove(e: MouseEvent) {
  if (!isPickerActive) return;

  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || target === overlayEl || target === badgeEl || target === bannerEl || bannerEl?.contains(target)) {
    return;
  }

  hoveredElement = target;
  updateOverlay(target);
}

function updateOverlay(el: Element) {
  if (!overlayEl || !badgeEl) return;

  const rect = el.getBoundingClientRect();
  overlayEl.style.display = 'block';
  overlayEl.style.top = `${rect.top}px`;
  overlayEl.style.left = `${rect.left}px`;
  overlayEl.style.width = `${rect.width}px`;
  overlayEl.style.height = `${rect.height}px`;

  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0] || ''}` : '';
  badgeEl.textContent = `${tag}${id}${cls} (${Math.round(rect.width)} × ${Math.round(rect.height)})`;
}

function handleClick(e: MouseEvent) {
  if (!isPickerActive) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (hoveredElement) {
    const result = buildElementSelectionResult(hoveredElement);
    stopElementPicker();
    onPickCallback?.(result);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isPickerActive) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    stopElementPicker();
    onCancelCallback?.();
  }
}

export function startElementPicker(onPick: PickCallback, onCancel: CancelCallback) {
  if (isPickerActive) return;
  isPickerActive = true;
  onPickCallback = onPick;
  onCancelCallback = onCancel;

  // Create overlay element
  overlayEl = document.createElement('div');
  overlayEl.className = 'autoflow-picker-overlay';

  badgeEl = document.createElement('div');
  badgeEl.className = 'autoflow-picker-badge';
  overlayEl.appendChild(badgeEl);

  // Create instructions banner
  bannerEl = document.createElement('div');
  bannerEl.className = 'autoflow-picker-banner';
  bannerEl.innerHTML = `
    <span class="autoflow-picker-banner-indicator"></span>
    <span><strong>Element Picker:</strong> Click any element to select it</span>
    <span class="autoflow-picker-kbd">Esc</span> to cancel
  `;

  document.body.appendChild(overlayEl);
  document.body.appendChild(bannerEl);

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
}

export function stopElementPicker() {
  if (!isPickerActive) return;
  isPickerActive = false;

  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);

  overlayEl?.remove();
  bannerEl?.remove();
  overlayEl = null;
  badgeEl = null;
  bannerEl = null;
  hoveredElement = null;
}
