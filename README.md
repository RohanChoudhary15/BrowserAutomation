# AutoFlow - Visual Browser Automation Extension

AutoFlow is a production-grade Chrome/Edge browser automation extension with a visual node-based workflow editor inspired by **n8n**, **Node-RED**, and **Figma**. It allows you to build, record, debug, and execute robust browser automation workflows directly against web pages using a dark developer-tool interface.

---

## ⚡ Core Features

- **Visual Workflow Canvas**: Drag-and-drop node graph powered by `@xyflow/react`, with pan/zoom, minimap, controls, grid snapping, multi-select, and custom handles.
- **Interactive Element Picker**: Visual overlay highlights elements on hover and captures robust, ranked selector strategies (`data-testid`, `id`, `name`, `aria-label`, role + text, stable CSS, XPath).
- **Browser Action Recorder**: Live recording of clicks, text typing (automatically debounced into coherent text inputs), dropdown selection, and keypresses that instantly generate and auto-wire workflow nodes.
- **30+ Node Types**:
  - **Browser**: Navigate, Back, Forward, Reload, New Tab, Close Tab, Switch Tab
  - **Interaction**: Click (left/double/right), Type Text, Clear Input, Hover, Press Key, Scroll, Select Dropdown, Drag & Drop
  - **Wait**: Wait (duration), Wait For Element, Wait For Text, Wait For Navigation
  - **Extraction**: Extract Text, Extract Attribute, Extract HTML, Extract Table (into structured JSON), Extract Multiple, Extract Links
  - **Logic**: Condition (TRUE/FALSE branching), Contains (checks if an element/text is present on the page, TRUE/FALSE branching), Loop, For Each, Try/Catch, Break, Continue
  - **Data**: Set Variable, Get Variable, Transform (uppercase, lowercase, trim, replace, split, parseNumber, parseJSON), Regex, JSON Parse, Generate Data (mock emails, names, UUIDs, timestamps)
  - **Utility**: Screenshot (capture visible viewport), Execute JavaScript (in page context), HTTP Request (REST API calls), Storage Manage (local/sessionStorage), Clipboard (read/write), AI Agent, Autonomous Agent
  - **Messaging & Notifications**:
    - **Telegram Message**: Dispatch alerts, formatted HTML/MarkdownV2 messages, or data directly to Telegram chats or channels via Bot API.
    - **Discord Message**: Post notifications, rich embeds with custom colors/titles/descriptions, or webhook messages to Discord channels via Webhooks or Bot Token.
    - **Slack Message**: Deliver alerts and markdown reports to Slack channels via Incoming Webhooks or Bot User OAuth Tokens (`chat.postMessage`).
- **Variable Interpolation**: Reference variables anywhere using `{{variable}}`, `{{user.name}}`, or `{{items[0].price}}`.
- **Human Mode**: A per-workflow toggle that adds curved cursor travel and jittered micro-pauses (Subtle / Natural / Slow pacing) so runs look like real user activity.
- **Debugging & Single Node Execution**: Execute individual nodes on demand directly against the active browser tab.
- **True Cancellation**: `AbortController` signal cancels running timers, loops, and DOM queries immediately.
- **Persistence & Portability**: IndexedDB storage for workflows, with autosave, JSON Export, and schema-validated JSON Import.
- **Side Panel & Standalone Views**: Runs in Chrome Side Panel (`sidepanel.html`) next to the target tab, or in full-screen editor (`index.html`).

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm**: v9.0.0 or later
- **Google Chrome** or **Microsoft Edge**

### 2. Installation

Clone or open the repository directory:

```bash
cd BrowserAutomation
npm install
```

### 3. Development Mode

To run Vite in dev mode:

```bash
npm run dev
```

### 4. Building the Extension

To compile the complete Manifest V3 unpacked extension:

```bash
npm run build
```

This compiles:
- Full Editor (`dist/index.html`)
- Side Panel Editor (`dist/sidepanel.html`)
- Quick Popup (`dist/popup.html`)
- Background Service Worker (`dist/background.js`)
- Content Script & CSS (`dist/content.js`, `dist/content.css`)
- Extension Manifest & Icons (`dist/manifest.json`, `dist/icons/`)

The output is located in the **`dist/`** directory.

### 5. Running Tests

Run unit tests with Vitest:

```bash
npm test
```

---

## 🌐 Loading into Chrome & Edge

### Loading into Google Chrome:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`dist/`** folder inside this project directory.
5. Click the AutoFlow extension icon in your Chrome toolbar to open the popup or Side Panel!

### Loading into Microsoft Edge:
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Turn on **Developer mode** in the left sidebar.
3. Click **Load unpacked** at the top.
4. Select the **`dist/`** folder inside this project directory.
5. Pin AutoFlow to your toolbar.

---

## 🏗️ Architecture

AutoFlow follows a modular Manifest V3 architecture with strict separation of concerns:

```text
┌─────────────────────────────────────────────────────────────┐
│                      EXTENSION VIEWS                        │
│                                                             │
│   Full Editor (index.html)     Side Panel (sidepanel.html)  │
│   ├── Workflow Canvas          ├── Element Picker Trigger   │
│   ├── Node Library             ├── Execution Console        │
│   └── Properties Panel         └── Variables Inspector      │
└──────────────────────────────┬──────────────────────────────┘
                               │ chrome.runtime.sendMessage
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 BACKGROUND SERVICE WORKER                   │
│                     (background.js)                         │
│                                                             │
│   • Tab lifecycle management                                │
│   • Screenshot capture (captureVisibleTab)                  │
│   • Content script injection fallback                       │
│   • Message router between Editor and Webpage Tabs          │
└──────────────────────────────┬──────────────────────────────┘
                               │ chrome.tabs.sendMessage
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       CONTENT SCRIPT                        │
│                        (content.js)                         │
│                                                             │
│   • DOM Actions (click, type, scroll, extract, wait)        │
│   • Interactive Element Picker Overlay & Strategy Generator │
│   • Action Recorder (event listeners with debouncing)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      CURRENT WEB PAGE                       │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure

```text
src/
├── background/          # Manifest V3 service worker & tab router
├── content/             # In-page DOM actions, picker overlay, and recorder
├── editor/              # Main visual editor application & state hooks
├── popup/               # Quick popup launcher
├── components/
│   ├── canvas/          # React Flow canvas, minimap, context menu, quick-add
│   ├── sidebar/         # Node library sidebar and workflow list modal
│   ├── properties/      # Configuration panel for selected node
│   ├── bottompanel/     # Execution logs, variables, and output inspector
│   └── topbar/          # Run/Stop controls, recorder toggle, export/import
├── nodes/               # Custom React Flow nodes and node registry
├── runtime/             # Workflow execution engine, variable interpolator, condition evaluator
├── selectors/           # Multi-strategy selector generator and finder
├── storage/             # IndexedDB persistence layer and starter workflow
├── types/               # Strongly-typed TypeScript interfaces
└── utils/               # Formatting, ID generation, and secret redaction
```

---

## 🎯 How the Element Picker Works

1. In the Properties panel of any interaction node (Click, Type Text, Extract Text, etc.), click **[Select Element]**.
2. The editor sends a message to the active tab's content script to activate Picker Mode.
3. As the user hovers over page elements, a subtle high-contrast outline and badge display the tag, ID, classes, and dimensions.
4. When the user clicks an element:
   - Default browser actions (navigation, form submits) are prevented.
   - The selector generator analyzes the element and produces ranked strategies:
     1. `data-testid` / `data-test` / `data-cy` (highest reliability)
     2. Stable ID (ignoring dynamic IDs like `:r1:` or `react-aria-123`)
     3. Form attributes (`name`, `placeholder`)
     4. Accessibility attributes (`aria-label`, `role`)
     5. Semantic text query (`button:has-text("Submit")`)
     6. Clean CSS class hierarchy
     7. XPath structure
   - The selection payload is sent back to the editor.
   - The primary selector and all alternative strategies are immediately populated into the node's properties.
5. Pressing `Escape` cancels picker mode without changes.

---

## 🎥 How the Action Recorder Works

1. Click the **● Record** button in the top toolbar.
2. The content script attaches listeners for `click`, `input`, `change`, and `keydown`.
3. **Smart Debouncing**: As the user types into an input field, keystrokes are debounced into a single `Type Text` node with the final value, instead of creating dozens of single-character nodes.
4. When actions occur, the recorder captures:
   - Target element and generated selector
   - Action type (click, type, select dropdown, Enter key)
5. The editor receives recorded actions in real time, automatically creates nodes on the canvas, and wires them in sequential execution order.
6. Click **Stop Recording** to finish. The generated workflow remains 100% editable.

---

## 🐇 Human Mode

Real automation rarely looks like a machine gun of instant clicks. Human Mode makes a run *read* like a person using the page: the cursor travels in arcs, actions are padded with small jittered pauses, and each node "thinks" before acting.

### Turning it on

Click the **Human** button in the toolbar (it turns amber and reads **Human: ON**), then use the adjacent **▾** for pacing options:

| Pacing | Between nodes | Typing / char | Action pauses |
| :--- | :--- | :--- | :--- |
| **Subtle** | ~30–90 ms | ~40–110 ms | ~20–60 ms |
| **Natural** (default) | ~80–220 ms | ~55–160 ms | ~40–140 ms |
| **Slow** | ~200–450 ms | ~90–260 ms | ~80–240 ms |

There is also a **Show moving cursor** checkbox. The setting is stored **per workflow** in `settings.humanMode` / `humanIntensity` / `humanCursor`, so it persists with the workflow and travels in JSON export/import.

### What changes during a run

- **Curved cursor travel** — an overlay cursor (`#autoflow-human-cursor`) follows a quadratic Bézier arc with a jittered control point, per-step positional noise, and an occasional 3–9 px overshoot-then-correct. It dispatches real `mousemove` events along the way, so page hover states fire naturally.
- **Click** — the cursor glides to the element center (±2–4 px), hovers a beat, presses, shows a ripple, then lingers before the next step.
- **Type** — a short "focus" pause before the first keystroke, human per-character delays, and a longer beat at word boundaries and before pressing Enter.
- **Hover** — approaches along the path first and then dwells on the element.
- **Scroll** — one big jump becomes 3–8 wheel-sized nudges with short gaps, so lazy-loaded content behaves normally.
- **Select / Clear** — cursor moves onto the control, with pre/post pauses.
- **Between nodes** — the engine waits a clustered, jittered think-time (retry backoffs are jittered too).

### Guarantees & notes

- **Off by default.** With the toggle off, `resolveHumanConfig()` returns `undefined`, no config crosses the message boundary, and execution is byte-for-byte as fast as before.
- **Real precision is preserved.** The overlay is `pointer-events: none` and purely cosmetic — clicks still dispatch on true element coordinates.
- **Explicit node values win.** If a `Type Text` node sets its own `typingDelay`, Human Mode never overrides it.
- **Cancellation still works.** Every pause is abort-aware, so **Stop** interrupts think-time and cursor travel immediately.
- **Accessibility.** Users with `prefers-reduced-motion: reduce` get instant cursor jumps instead of animation.
- **Scope.** Human Mode affects workflow node execution. The separate Autonomous Agent has its own independent `stepDelay`.
- **Expect it to be slower** — roughly +0.3–1.5 s per action; use **Subtle** pacing or turn it off when you don't need stealth.

---

## ➕ How to Add a New Node Type

AutoFlow is architected with a decoupled node registry. Adding a new node takes just 3 steps:

### 1. Define the Node in `src/types/workflow.ts`

Add your node type string to `NodeType`:

```typescript
export type NodeType = ... | 'my_custom_node';
```

### 2. Register in `src/nodes/registry.ts`

```typescript
my_custom_node: {
  type: 'my_custom_node',
  label: 'My Custom Node',
  category: 'utility',
  description: 'Does something awesome',
  icon: 'Zap',
  defaultProperties: {
    param1: 'default value',
  },
},
```

### 3. Implement Executor in `src/runtime/executors/index.ts`

```typescript
export const executeMyCustomNode: NodeExecutor = async (node, ctx) => {
  const param1 = interpolateVariables(node.data.properties.param1, ctx.variables);
  ctx.log({ level: 'info', message: `Executing custom node with ${param1}` });
  // Perform your logic (DOM message, fetch, etc.)
  return {
    success: true,
    output: { result: 'ok' },
    variables: { myResult: 'ok' },
  };
};

// Add to executors map:
executors.my_custom_node = executeMyCustomNode;
```

That's it! The node will automatically appear in the Node Library, search, canvas quick-add menu, and execution engine.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl / Cmd + Enter` | Run Workflow |
| `Ctrl / Cmd + Z` | Undo |
| `Ctrl / Cmd + Shift + Z` / `Ctrl + Y` | Redo |
| `Delete` / `Backspace` | Delete selected node |
| `R` | Toggle Recording |
| `F` | Fit Canvas to View |
| `Double Click Canvas` | Open Quick-Add Node search |

---

## 🔒 Security & Privacy

- **Secret Redaction**: Passwords, auth tokens, and API keys are automatically redacted in logs (`password = ********`).
- **Minimal Permissions**: Uses standard MV3 permissions (`storage`, `tabs`, `scripting`, `activeTab`, `sidePanel`, `webNavigation`).
- **Isolated Page Execution**: Content scripts run with DOM access without leaking extension privileges into page window scope.
