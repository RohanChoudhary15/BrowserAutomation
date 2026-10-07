import React, { useState, useMemo } from 'react';
import { WorkflowNode } from '../../../types/workflow';
import {
  Scissors,
  Sparkles,
  Type,
  Hash,
  SlidersHorizontal,
  Layers,
  Link2,
  Calendar,
  DollarSign,
  Braces,
  Copy,
  Check,
  Info,
  ArrowRight,
  Terminal,
  HelpCircle,
  Repeat,
  ListFilter,
  CheckSquare,
  Globe,
  Calculator,
  Clock,
} from 'lucide-react';
import { applyStringOperation } from '../../../utils/stringTransform';

export interface TransformPropertiesProps {
  selectedNode: WorkflowNode;
  onPropChange: (key: string, value: any) => void;
}

type OperationCategory =
  | 'slice_extract'
  | 'strip_clean'
  | 'casing'
  | 'replace_pad'
  | 'split_join'
  | 'arrays_lists'
  | 'dates_time'
  | 'boolean_logic'
  | 'urls_links'
  | 'numbers_math'
  | 'data_objects';

interface OperationDef {
  id: string;
  label: string;
  description: string;
  category: OperationCategory;
  example: string;
}

const OPERATIONS: OperationDef[] = [
  // Slice & Extract
  { id: 'slice', label: 'Python Slice Notation [start:end]', description: 'Python-style slice like [4:7], [:-3], [2:], [::-1]', category: 'slice_extract', example: '"hello world"[0:5] → "hello"' },
  { id: 'remove_start', label: 'Remove Starting Letters / Prefix', description: 'Remove first N characters or specific leading prefix', category: 'slice_extract', example: '"ABC12345" - first 3 → "12345"' },
  { id: 'remove_end', label: 'Remove Ending Letters / Suffix', description: 'Remove last N characters or specific trailing suffix', category: 'slice_extract', example: '"doc.pdf" - last 4 → "doc"' },
  { id: 'keep_start', label: 'Keep First N Letters', description: 'Extract only the first N characters of text', category: 'slice_extract', example: '"AutoFlow" (first 4) → "Auto"' },
  { id: 'keep_end', label: 'Keep Last N Letters', description: 'Extract only the last N characters of text', category: 'slice_extract', example: '"AutoFlow" (last 4) → "Flow"' },
  { id: 'substring_between', label: 'Extract Between Delimiters', description: 'Extract text inside boundaries like (parentheses) or [brackets]', category: 'slice_extract', example: '"Price: ($49)" between ( and ) → "$49"' },
  { id: 'substring_before', label: 'Extract Before Delimiter', description: 'Extract text before a specific character or separator', category: 'slice_extract', example: '"john@domain.com" before @ → "john"' },
  { id: 'substring_after', label: 'Extract After Delimiter', description: 'Extract text after a specific character or separator', category: 'slice_extract', example: '"john@domain.com" after @ → "domain.com"' },
  { id: 'substring', label: 'Substring (Index & Length)', description: 'Standard substring with start index and character count', category: 'slice_extract', example: '"abcdef" start 2 len 3 → "cde"' },
  { id: 'char_at', label: 'Character at Index', description: 'Extract single character at positive or negative index', category: 'slice_extract', example: '"AutoFlow"[0] → "A"' },
  { id: 'extractField', label: 'Extract Object Property / Field', description: 'Extract a nested key from an object or JSON string using dot notation', category: 'slice_extract', example: '{{item}}.price → "$19.99"' },

  // Strip & Clean
  { id: 'trim', label: 'Strip / Trim Characters (Both Ends)', description: 'Remove whitespace or custom characters from both sides', category: 'strip_clean', example: '"  hello  " → "hello"' },
  { id: 'strip_start', label: 'Strip from Start (lstrip)', description: 'Remove whitespace or custom characters from the beginning', category: 'strip_clean', example: '"///path/" strip / → "path/"' },
  { id: 'strip_end', label: 'Strip from End (rstrip)', description: 'Remove whitespace or custom characters from the end', category: 'strip_clean', example: '"path///" strip / → "path"' },
  { id: 'clean_whitespace', label: 'Normalize Whitespace', description: 'Collapse multiple spaces, tabs, and newlines into a single space', category: 'strip_clean', example: '"a   b\\n  c" → "a b c"' },
  { id: 'slugify', label: 'Convert to URL Slug', description: 'Clean text into URL-friendly slug (lowercased, hyphenated)', category: 'strip_clean', example: '"Product #1 New!" → "product-1-new"' },
  { id: 'remove_accents', label: 'Remove Accents & Diacritics', description: 'Convert accented characters (é, ü, ñ) to plain ASCII equivalents', category: 'strip_clean', example: '"café résumé" → "cafe resume"' },
  { id: 'html_decode', label: 'Decode HTML Entities', description: 'Convert &amp;, &lt;, &gt;, &#39; into readable characters', category: 'strip_clean', example: '"Fish &amp; Chips" → "Fish & Chips"' },

  // Case & Format
  { id: 'lowercase', label: 'To Lowercase', description: 'Convert all letters to lowercase', category: 'casing', example: '"HELLO WORLD" → "hello world"' },
  { id: 'uppercase', label: 'To Uppercase', description: 'Convert all letters to uppercase', category: 'casing', example: '"hello world" → "HELLO WORLD"' },
  { id: 'title_case', label: 'Title Case', description: 'Capitalize the first letter of each word', category: 'casing', example: '"the quick brown fox" → "The Quick Brown Fox"' },
  { id: 'capitalize', label: 'Capitalize First Letter', description: 'Capitalize only the first character of the string', category: 'casing', example: '"hello world" → "Hello world"' },
  { id: 'camel_case', label: 'camelCase', description: 'Convert to camelCase for variable names and identifiers', category: 'casing', example: '"user first name" → "userFirstName"' },
  { id: 'snake_case', label: 'snake_case', description: 'Convert to snake_case with underscores', category: 'casing', example: '"User First Name" → "user_first_name"' },
  { id: 'kebab_case', label: 'kebab-case', description: 'Convert to kebab-case with hyphens', category: 'casing', example: '"User First Name" → "user-first-name"' },

  // Replace & Pad
  { id: 'replace', label: 'Find & Replace', description: 'Replace occurrences of text or regular expression pattern', category: 'replace_pad', example: '"2024-05" replace "-" with "/" → "2024/05"' },
  { id: 'pad_start', label: 'Pad Start (Leading Zeros/Chars)', description: 'Pad beginning of text to target length (e.g. invoice numbers)', category: 'replace_pad', example: '"42" pad 5 with "0" → "00042"' },
  { id: 'pad_end', label: 'Pad End (Trailing Chars)', description: 'Pad end of text to target length with custom fill character', category: 'replace_pad', example: '"Test" pad 8 with "." → "Test...."' },
  { id: 'truncate', label: 'Truncate with Ellipsis', description: 'Shorten text to max length with ... (preserves word boundary)', category: 'replace_pad', example: '"Long article text..." → "Long article..."' },
  { id: 'wrap', label: 'Wrap with Prefix & Suffix', description: 'Prepend and append custom text around the input', category: 'replace_pad', example: '"bold" wrap with "**" → "**bold**"' },

  // Split, Join & Count
  { id: 'split', label: 'Split Text to Array', description: 'Split string by delimiter into a list of items', category: 'split_join', example: '"apple, banana, grape" → ["apple", "banana", "grape"]' },
  { id: 'join', label: 'Join Array to String', description: 'Combine array elements into a single delimited text string', category: 'split_join', example: '["a", "b", "c"] join ", " → "a, b, c"' },
  { id: 'count', label: 'Count (Chars, Words, Lines, Occurrences)', description: 'Calculate total length, word count, line count, or matches', category: 'split_join', example: '"Word count test" → 3 words' },

  // Arrays & Lists (NEW)
  { id: 'array_deduplicate', label: 'Deduplicate / Unique List', description: 'Remove duplicate rows, URLs, or objects by unique property or value', category: 'arrays_lists', example: '["a", "b", "a"] → ["a", "b"]' },
  { id: 'array_filter', label: 'Filter List by Condition', description: 'Keep items where price < 50 or in_stock == true', category: 'arrays_lists', example: 'items where price < 50' },
  { id: 'array_sort', label: 'Sort List (Asc / Desc)', description: 'Sort list alphabetically, numerically, or by object key', category: 'arrays_lists', example: '[3, 1, 2] → [1, 2, 3]' },
  { id: 'array_chunk', label: 'Chunk into Batches of N', description: 'Split list of 100 items into batches of 10 for pagination or rate limits', category: 'arrays_lists', example: '[1, 2, 3, 4] batch 2 → [[1, 2], [3, 4]]' },
  { id: 'array_take', label: 'Take First / Last N Items', description: 'Extract only the first N or last N items from array', category: 'arrays_lists', example: '[1, 2, 3, 4] take 2 → [1, 2]' },
  { id: 'array_drop', label: 'Drop First / Last N Items', description: 'Remove first N or last N items from array', category: 'arrays_lists', example: '[1, 2, 3, 4] drop 2 → [3, 4]' },
  { id: 'array_flatten', label: 'Flatten Nested Arrays', description: 'Merge nested arrays [[1, 2], [3]] into [1, 2, 3]', category: 'arrays_lists', example: '[[1, 2], [3]] → [1, 2, 3]' },

  // Dates & Timestamps (NEW)
  { id: 'date_math', label: 'Date Math (+7 days, -2 hours)', description: 'Add/subtract days, hours, minutes (+7 days, -1 month)', category: 'dates_time', example: '"now" + 7 days → "2026-10-14..."' },
  { id: 'date_relative_parse', label: 'Relative Time Parser', description: 'Convert "2 hours ago" or "yesterday" into standard ISO format', category: 'dates_time', example: '"2 hours ago" → ISO timestamp' },
  { id: 'date_diff', label: 'Date Difference', description: 'Calculate difference between two dates in days, hours, or minutes', category: 'dates_time', example: 'date1 - date2 in days → 5' },
  { id: 'date_format_mask', label: 'Format Mask (YYYY-MM-DD)', description: 'Format date with mask like YYYY-MM-DD, DD/MM/YYYY, hh:mm A', category: 'dates_time', example: '"2026-10-07" → "07/10/2026"' },
  { id: 'date_timezone', label: 'Timezone Conversion', description: 'Convert UTC timestamp to local browser or target timezone', category: 'dates_time', example: '"2026-10-07T12:00:00Z" → "America/New_York"' },
  { id: 'formatDate', label: 'Legacy Date Formatter', description: 'Parse relative date or date string into ISO Date or Timestamp', category: 'dates_time', example: '"2 hours ago" → "2024-05-18"' },

  // Booleans & Logic (NEW)
  { id: 'is_empty', label: 'Is Empty Check', description: 'Test if string, array, or object has no data (null, empty string, [])', category: 'boolean_logic', example: '"" or [] → true' },
  { id: 'is_not_empty', label: 'Is Not Empty Check', description: 'Test if string, array, or object has data', category: 'boolean_logic', example: '"hello" → true' },
  { id: 'boolean_not', label: 'Logical NOT / Invert', description: 'Flip boolean flag (true → false, false → true)', category: 'boolean_logic', example: 'true → false' },
  { id: 'boolean_compare', label: 'Compare Values (==, !=, <, >, includes)', description: 'Compare input with value using comparison operator', category: 'boolean_logic', example: 'price < 50 → true' },
  { id: 'boolean_coerce', label: 'Truthy / Falsy Coercion', description: 'Convert string "true" / "0" / "" to genuine boolean', category: 'boolean_logic', example: '"true" → true, "0" → false' },

  // URLs & Links (NEW)
  { id: 'url_extract_param', label: 'Extract Query Parameter', description: 'Get specific query value like ?v=dQw4w9WgXcQ or ?id=123', category: 'urls_links', example: '"?v=dQw4w9WgXcQ" param "v" → "dQw4w9WgXcQ"' },
  { id: 'url_extract_domain', label: 'Extract Domain / Hostname', description: 'https://sub.domain.com/path → sub.domain.com', category: 'urls_links', example: '"https://sub.domain.com/path" → "sub.domain.com"' },
  { id: 'url_extract_path', label: 'Extract Pathname', description: 'Extract pathname from URL: /products/electronics/item-1', category: 'urls_links', example: '"https://example.com/item" → "/item"' },
  { id: 'url_build_query', label: 'Build Query String', description: 'Convert { search: "laptop", page: 2 } into ?search=laptop&page=2', category: 'urls_links', example: '{ search: "laptop" } → "?search=laptop"' },
  { id: 'normalizeUrl', label: 'Normalize URL (Prepend Base / Strip Tracking)', description: 'Prepend domain prefix to relative URLs and strip tracking parameters', category: 'urls_links', example: '"/dp/B08X" → "https://amazon.com/dp/B08X"' },

  // Numbers & Math (NEW)
  { id: 'math_expression', label: 'Math Expression ((a * b) + c)', description: 'Safe arithmetic calculation like (x * 1.2) + 5 or percentage discount', category: 'numbers_math', example: '(x * 1.2) + 5' },
  { id: 'math_clamp', label: 'Clamp Number [min, max]', description: 'Restrict number between min and max boundaries', category: 'numbers_math', example: 'clamp(150, 0, 100) → 100' },
  { id: 'math_random', label: 'Random Number in Range', description: 'Generate random number between min and max for dynamic delays', category: 'numbers_math', example: 'random(1000, 5000)' },
  { id: 'math_aggregate', label: 'Aggregate (Sum / Avg / Min / Max)', description: 'Aggregate over an array of numbers or object properties', category: 'numbers_math', example: '[10, 20, 30] avg → 20' },
  { id: 'cleanPrice', label: 'Clean Price / Extract Number', description: 'Extract numeric value from currency strings like $1,299.99', category: 'numbers_math', example: '"$1,299.99 USD" → "1299.99"' },
  { id: 'formatCurrency', label: 'Format as Currency', description: 'Format number into clean currency with symbol and decimal formatting', category: 'numbers_math', example: '1299.99 → "$1,299.99"' },
  { id: 'roundNumber', label: 'Round / Floor / Ceil Number', description: 'Round numeric value to specified decimal precision', category: 'numbers_math', example: '3.14159 round 2 → 3.14' },
  { id: 'parseNumber', label: 'Extract / Parse Raw Number', description: 'Strip all non-numeric characters and parse as float/integer', category: 'numbers_math', example: '"Score: 98.5%" → 98.5' },

  // Data & Objects
  { id: 'parseJSON', label: 'Parse JSON String to Object', description: 'Parse JSON string into a structured JavaScript object', category: 'data_objects', example: '\'{"id": 1}\' → { id: 1 }' },
  { id: 'stringifyJSON', label: 'Convert Object to JSON String', description: 'Serialize object or array into pretty-printed JSON string', category: 'data_objects', example: '{ id: 1 } → \'{"id": 1}\'' },
  { id: 'defaultFallback', label: 'Fallback Value if Empty', description: 'Return fallback value if input is null, undefined, or empty string', category: 'data_objects', example: '"" fallback "N/A" → "N/A"' },
];

const CATEGORY_TABS: { id: OperationCategory; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'arrays_lists', label: 'Arrays & Lists', icon: ListFilter },
  { id: 'slice_extract', label: 'Slice & Extract', icon: Scissors },
  { id: 'strip_clean', label: 'Strip & Clean', icon: Sparkles },
  { id: 'casing', label: 'Case & Format', icon: Type },
  { id: 'replace_pad', label: 'Replace & Pad', icon: SlidersHorizontal },
  { id: 'split_join', label: 'Split & Join', icon: Layers },
  { id: 'numbers_math', label: 'Numbers & Math', icon: Calculator },
  { id: 'dates_time', label: 'Dates & Time', icon: Calendar },
  { id: 'boolean_logic', label: 'Booleans & Logic', icon: CheckSquare },
  { id: 'urls_links', label: 'URLs & Links', icon: Globe },
  { id: 'data_objects', label: 'Data & JSON', icon: Braces },
];

export const TransformProperties: React.FC<TransformPropertiesProps> = ({
  selectedNode,
  onPropChange,
}) => {
  const props = selectedNode.data.properties || {};
  const currentOp = props.operation || 'trim';

  // Find active category based on current operation
  const activeDef = useMemo(() => {
    return OPERATIONS.find((o) => o.id === currentOp) || OPERATIONS[0];
  }, [currentOp]);

  const [activeCategory, setActiveCategory] = useState<OperationCategory>(activeDef.category);
  const [copied, setCopied] = useState(false);

  // Default interactive test playground input
  const [testInput, setTestInput] = useState<string>(() => {
    if (props.input && !props.input.includes('{{')) return props.input;
    if (currentOp === 'cleanPrice' || currentOp === 'formatCurrency') return '$1,299.99 USD';
    if (currentOp === 'slice') return 'Hello World 2024';
    if (currentOp === 'remove_start' || currentOp === 'remove_end') return 'PREFIX_User_12345_SUFFIX';
    if (currentOp === 'substring_between') return 'Item SKU: (SKU-99482) - In Stock';
    if (currentOp.startsWith('array_') || currentOp === 'math_aggregate') {
      return '[{"name":"Laptop","price":999},{"name":"Mouse","price":25},{"name":"Keyboard","price":75}]';
    }
    if (currentOp === 'date_math') return '2026-10-07';
    if (currentOp === 'date_relative_parse') return '2 hours ago';
    if (currentOp === 'date_diff') return '2026-10-15';
    if (currentOp === 'date_format_mask') return '2026-10-07T14:30:00Z';
    if (currentOp === 'url_extract_param' || currentOp === 'url_extract_domain' || currentOp === 'url_extract_path') {
      return 'https://www.example.com/products/item-1?v=dQw4w9WgXcQ&page=2';
    }
    if (currentOp === 'url_build_query') return '{"search":"laptop","page":2}';
    if (currentOp === 'math_expression' || currentOp === 'math_clamp') return '150';
    if (currentOp === 'math_random') return '100';
    if (currentOp.startsWith('boolean_') || currentOp.startsWith('is_')) return 'true';
    return 'The quick brown fox jumps over the lazy dog (2024)';
  });

  // Calculate live evaluated result
  const livePreview = useMemo(() => {
    try {
      const res = applyStringOperation(testInput, currentOp, {
        ...props,
        sliceExpr: props.sliceExpr,
        start: props.start !== undefined ? Number(props.start) : undefined,
        end: props.end !== undefined ? Number(props.end) : undefined,
        length: props.length !== undefined ? Number(props.length) : undefined,
        count: props.count !== undefined ? Number(props.count) : undefined,
        prefix: props.prefix,
        suffix: props.suffix,
        chars: props.chars,
        stripMode: props.stripMode,
        delimiter: props.delimiter,
        search: props.search,
        replaceWith: props.replaceWith,
        startDelimiter: props.startDelimiter,
        endDelimiter: props.endDelimiter,
        inclusive: props.inclusive,
        fromEnd: props.fromEnd,
        decimals: props.decimals,
        roundMode: props.roundMode,
        currencySymbol: props.currencySymbol,
        priceMode: props.priceMode,
        field: props.field,
        fallbackValue: props.fallbackValue,
        // Arrays & Lists
        key: props.key,
        filterExpr: props.filterExpr || props.condition,
        condition: props.condition,
        operator: props.operator,
        filterValue: props.filterValue !== undefined ? props.filterValue : props.value,
        value: props.value,
        sortKey: props.sortKey,
        sortOrder: props.sortOrder,
        sortType: props.sortType,
        chunkSize: props.chunkSize !== undefined ? Number(props.chunkSize) : undefined,
        takeMode: props.takeMode,
        dropMode: props.dropMode,
        deep: props.deep,
        // Dates & Timestamps
        dateMathExpr: props.dateMathExpr || props.expression,
        dateOffsetValue: props.dateOffsetValue,
        dateOffsetUnit: props.dateOffsetUnit,
        compareDate: props.compareDate,
        diffUnit: props.diffUnit,
        formatMask: props.formatMask,
        targetTimezone: props.targetTimezone,
        // Booleans & Logic
        compareValue: props.compareValue !== undefined ? props.compareValue : props.value,
        // URLs & Links
        paramName: props.paramName || props.param,
        stripWww: props.stripWww,
        includeQuestionMark: props.includeQuestionMark,
        // Numbers & Math
        expression: props.expression,
        min: props.min !== undefined ? Number(props.min) : undefined,
        max: props.max !== undefined ? Number(props.max) : undefined,
        integer: props.integer,
        aggregateType: props.aggregateType,
      });

      return {
        value: res,
        type: Array.isArray(res)
          ? `array (${res.length} items)`
          : typeof res === 'object' && res !== null
          ? 'object'
          : typeof res,
        error: null,
      };
    } catch (err: any) {
      return {
        value: null,
        type: 'error',
        error: err?.message || 'Transformation error',
      };
    }
  }, [testInput, currentOp, props]);

  const handleCopyResult = () => {
    if (livePreview.value === null || livePreview.value === undefined) return;
    const text =
      typeof livePreview.value === 'object'
        ? JSON.stringify(livePreview.value, null, 2)
        : String(livePreview.value);
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Header & Inputs */}
      <div className="space-y-2.5">
        <div>
          <label className="block text-[11px] font-medium text-gray-300 mb-1">
            Input Text, Variable or Object
          </label>
          <div className="relative">
            <input
              type="text"
              value={props.input || ''}
              onChange={(e) => onPropChange('input', e.target.value)}
              placeholder="e.g. {{currentProduct}}, {{title}}, {{scrapedProducts}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] text-gray-500 py-0.5">Quick variables:</span>
            {['{{item}}', '{{title}}', '{{price}}', '{{link}}', '{{currentProduct}}'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onPropChange('input', v)}
                className="px-1.5 py-0.5 rounded bg-[#182030] hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/20 text-[10px] font-mono transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-gray-300 mb-1">
            Save Transformed Value to Variable
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={props.outputVariable || 'transformedValue'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="transformedValue"
              className="flex-1 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
            />
            <span className="px-2 py-1.5 rounded bg-indigo-950/60 border border-indigo-700/40 text-indigo-300 text-[10px] font-mono shrink-0 select-all">
              &#123;&#123;{props.outputVariable || 'transformedValue'}&#125;&#125;
            </span>
          </div>
        </div>
      </div>

      {/* 2. Category Selector Pills */}
      <div>
        <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
          Transformation Category
        </label>
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0d1017] rounded-xl border border-[#1c2230]">
          {CATEGORY_TABS.map((cat) => {
            const IconComp = cat.icon;
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  // Auto-select the first operation of this category if not currently in it
                  const firstOp = OPERATIONS.find((o) => o.category === cat.id);
                  if (firstOp && activeDef.category !== cat.id) {
                    onPropChange('operation', firstOp.id);
                  }
                }}
                className={`py-1.5 px-1 rounded-lg text-[10px] font-medium flex flex-col items-center justify-center gap-1 transition-all text-center ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#161c29]'
                }`}
                title={cat.label}
              >
                <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-gray-400'}`} />
                <span className="truncate w-full leading-tight">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Operation Dropdown with Rich Details */}
      <div>
        <label className="block text-[11px] font-medium text-gray-400 mb-1">
          Select Operation
        </label>
        <select
          value={currentOp}
          onChange={(e) => {
            const nextOp = e.target.value;
            onPropChange('operation', nextOp);
            const found = OPERATIONS.find((o) => o.id === nextOp);
            if (found) setActiveCategory(found.category);
          }}
          className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
        >
          {OPERATIONS.filter((o) => o.category === activeCategory).map((op) => (
            <option key={op.id} value={op.id}>
              {op.label}
            </option>
          ))}
          <option disabled>────────── All Other Categories ──────────</option>
          {OPERATIONS.filter((o) => o.category !== activeCategory).map((op) => (
            <option key={op.id} value={op.id}>
              [{op.category.replace('_', ' ')}] {op.label}
            </option>
          ))}
        </select>

        {activeDef && (
          <div className="mt-1.5 p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/20 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
            <div className="text-[10px] text-gray-300 space-y-0.5">
              <div>{activeDef.description}</div>
              <div className="text-indigo-300 font-mono text-[9px] bg-black/40 px-1 py-0.5 rounded inline-block">
                e.g. {activeDef.example}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Operation-Specific Parameter Inputs */}
      <div className="p-3 rounded-xl bg-[#0d1017] border border-[#1c2230] space-y-3">
        {/* Python Slice Notation */}
        {(currentOp === 'slice' || currentOp === 'python_slice') && (
          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-indigo-300 flex items-center gap-1">
                  <Scissors className="w-3 h-3 text-indigo-400" />
                  <span>Python Slice Notation [start:end:step]</span>
                </label>
                <span className="text-[9px] text-gray-500">Supports negative indices</span>
              </div>
              <input
                type="text"
                value={props.sliceExpr ?? '4:7'}
                onChange={(e) => onPropChange('sliceExpr', e.target.value)}
                placeholder="e.g. 4:7 or :-3 or 2: or ::-1"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-indigo-500/40 focus:border-indigo-400 outline-none font-mono text-xs"
              />
            </div>

            {/* Quick Presets Pills */}
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Quick Python Slice Presets:</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { expr: '4:7', label: '[4:7] Letters 4 to 7' },
                  { expr: '0:5', label: '[0:5] First 5 chars' },
                  { expr: ':-3', label: '[:-3] Remove last 3' },
                  { expr: '3:', label: '[3:] Skip first 3' },
                  { expr: '-5:', label: '[-5:] Last 5 chars' },
                  { expr: '::-1', label: '[::-1] Reverse text' },
                ].map((preset) => (
                  <button
                    key={preset.expr}
                    type="button"
                    onClick={() => onPropChange('sliceExpr', preset.expr)}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono transition-colors border ${
                      props.sliceExpr === preset.expr
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-[#141a29] text-gray-300 hover:text-white border-[#222d42] hover:bg-[#1a2336]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-2 rounded bg-black/40 border border-white/5 text-[10px] text-gray-400 leading-relaxed">
              💡 <span className="text-gray-300 font-semibold">How slice works:</span> Zero-based. Positive numbers count from start (0 is 1st letter). Negative numbers count from end (<code className="text-indigo-300">-1</code> is last letter, <code className="text-indigo-300">:-3</code> removes last 3).
            </div>
          </div>
        )}

        {/* Remove Starting Letters / Prefix */}
        {currentOp === 'remove_start' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-gray-300">
                Number of Starting Letters to Remove
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={props.count ?? 3}
                onChange={(e) => onPropChange('count', Math.max(0, Number(e.target.value)))}
                placeholder="3"
                className="w-24 bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 8, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onPropChange('count', n)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border ${
                      props.count === n
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-[#141a29] text-gray-300 border-[#222d42] hover:bg-[#1a2336]'
                    }`}
                  >
                    -{n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Or Remove Specific Starting Prefix (optional)
              </label>
              <input
                type="text"
                value={props.prefix || ''}
                onChange={(e) => onPropChange('prefix', e.target.value)}
                placeholder="e.g. https:// or SKU_ or v"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Remove Ending Letters / Suffix */}
        {currentOp === 'remove_end' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-gray-300">
                Number of Ending Letters to Remove
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={props.count ?? 3}
                onChange={(e) => onPropChange('count', Math.max(0, Number(e.target.value)))}
                placeholder="3"
                className="w-24 bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 8, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onPropChange('count', n)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border ${
                      props.count === n
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-[#141a29] text-gray-300 border-[#222d42] hover:bg-[#1a2336]'
                    }`}
                  >
                    -{n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Or Remove Specific Ending Suffix (optional)
              </label>
              <input
                type="text"
                value={props.suffix || ''}
                onChange={(e) => onPropChange('suffix', e.target.value)}
                placeholder="e.g. .html or .json or _preview"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Keep First / Last N Letters */}
        {(currentOp === 'keep_start' || currentOp === 'keep_end') && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-300">
              {currentOp === 'keep_start' ? 'Number of Letters to Keep from Start' : 'Number of Letters to Keep from End'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={props.count ?? 5}
                onChange={(e) => onPropChange('count', Math.max(1, Number(e.target.value)))}
                placeholder="5"
                className="w-24 bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {[3, 5, 10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onPropChange('count', n)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border ${
                      props.count === n
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-[#141a29] text-gray-300 border-[#222d42] hover:bg-[#1a2336]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Strip / Trim Whitespace & Custom Characters */}
        {(currentOp === 'trim' || currentOp === 'strip_start' || currentOp === 'strip_end') && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-300">
              Custom Characters to Strip (Leave blank for whitespace)
            </label>
            <input
              type="text"
              value={props.chars || ''}
              onChange={(e) => onPropChange('chars', e.target.value)}
              placeholder="Leave blank for spaces/tabs/newlines or e.g. &quot;'/\-_"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-gray-500 py-0.5">Presets:</span>
              {[
                { label: 'Whitespace', val: '' },
                { label: 'Quotes ("\')', val: '"\'' },
                { label: 'Slashes (/)', val: '/' },
                { label: 'Brackets ([])', val: '[]()' },
                { label: 'Dashes (-_)', val: '-_' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onPropChange('chars', p.val)}
                  className="px-1.5 py-0.5 rounded bg-[#141a29] text-gray-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Substring Between Delimiters */}
        {currentOp === 'substring_between' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Start Delimiter
                </label>
                <input
                  type="text"
                  value={props.startDelimiter ?? '('}
                  onChange={(e) => onPropChange('startDelimiter', e.target.value)}
                  placeholder="e.g. ( or [ or <div>"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  End Delimiter
                </label>
                <input
                  type="text"
                  value={props.endDelimiter ?? ')'}
                  onChange={(e) => onPropChange('endDelimiter', e.target.value)}
                  placeholder="e.g. ) or ] or </div>"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-gray-500 py-0.5">Pairs:</span>
              {[
                { s: '(', e: ')', label: '( ... )' },
                { s: '[', e: ']', label: '[ ... ]' },
                { s: '{', e: '}', label: '{ ... }' },
                { s: '"', e: '"', label: '" ... "' },
                { s: "'", e: "'", label: "' ... '" },
                { s: '<', e: '>', label: '< ... >' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onPropChange('startDelimiter', p.s);
                    onPropChange('endDelimiter', p.e);
                  }}
                  className="px-2 py-0.5 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={props.inclusive === true}
                onChange={(e) => onPropChange('inclusive', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[10px]">Include delimiters in extracted output</span>
            </label>
          </div>
        )}

        {/* Substring Before / After */}
        {(currentOp === 'substring_before' || currentOp === 'substring_after') && (
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Delimiter Character or String
              </label>
              <input
                type="text"
                value={props.delimiter ?? '@'}
                onChange={(e) => onPropChange('delimiter', e.target.value)}
                placeholder="e.g. @, :, -, or //"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.fromEnd === true}
                onChange={(e) => onPropChange('fromEnd', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[10px]">Match from end (last occurrence instead of first)</span>
            </label>
          </div>
        )}

        {/* Standard Substring by Index and Length */}
        {currentOp === 'substring' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Start Index</label>
              <input
                type="number"
                value={props.start ?? 0}
                onChange={(e) => onPropChange('start', Number(e.target.value))}
                min={0}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Length</label>
              <input
                type="number"
                value={props.length ?? ''}
                onChange={(e) => onPropChange('length', e.target.value === '' ? undefined : Number(e.target.value))}
                min={1}
                placeholder="All remaining"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Character at Index */}
        {currentOp === 'char_at' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Character Index</label>
            <input
              type="number"
              value={props.start ?? 0}
              onChange={(e) => onPropChange('start', Number(e.target.value))}
              placeholder="0 (first) or -1 (last)"
              className="w-32 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
            <p className="text-[10px] text-gray-500 mt-1">Supports negative indices (-1 is the last character).</p>
          </div>
        )}

        {/* Extract Object Field */}
        {currentOp === 'extractField' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Field / Property Name (supports dot notation)
            </label>
            <input
              type="text"
              value={props.field || ''}
              onChange={(e) => onPropChange('field', e.target.value)}
              placeholder="e.g. title, price, details.rating, url"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-gray-500 py-0.5">Common fields:</span>
              {['title', 'price', 'link', 'image', 'rating', 'id', 'name'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onPropChange('field', f)}
                  className="px-1.5 py-0.5 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Replace */}
        {currentOp === 'replace' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Search For</label>
                <input
                  type="text"
                  value={props.search || ''}
                  onChange={(e) => onPropChange('search', e.target.value)}
                  placeholder="Text or pattern"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Replace With</label>
                <input
                  type="text"
                  value={props.replaceWith || ''}
                  onChange={(e) => onPropChange('replaceWith', e.target.value)}
                  placeholder="Replacement string"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.useRegex === true}
                  onChange={(e) => onPropChange('useRegex', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[10px]">Use Regular Expression</span>
              </label>
              <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.caseSensitive === true}
                  onChange={(e) => onPropChange('caseSensitive', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[10px]">Case Sensitive</span>
              </label>
            </div>
          </div>
        )}

        {/* Pad Start / End */}
        {(currentOp === 'pad_start' || currentOp === 'pad_end') && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Length</label>
              <input
                type="number"
                min={1}
                value={props.targetLength ?? 6}
                onChange={(e) => onPropChange('targetLength', Number(e.target.value))}
                placeholder="6"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Pad Character</label>
              <input
                type="text"
                maxLength={1}
                value={props.padChar ?? (currentOp === 'pad_start' ? '0' : ' ')}
                onChange={(e) => onPropChange('padChar', e.target.value)}
                placeholder="0 or space"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Truncate */}
        {currentOp === 'truncate' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Length</label>
                <input
                  type="number"
                  min={5}
                  value={props.maxLength ?? 50}
                  onChange={(e) => onPropChange('maxLength', Number(e.target.value))}
                  placeholder="50"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Ellipsis Symbol</label>
                <input
                  type="text"
                  value={props.ellipsis ?? '...'}
                  onChange={(e) => onPropChange('ellipsis', e.target.value)}
                  placeholder="..."
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.wordBoundary !== false}
                onChange={(e) => onPropChange('wordBoundary', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[10px]">Preserve whole word boundaries (avoid cutting words in half)</span>
            </label>
          </div>
        )}

        {/* Wrap */}
        {currentOp === 'wrap' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Prefix to Prepend</label>
              <input
                type="text"
                value={props.prefix || ''}
                onChange={(e) => onPropChange('prefix', e.target.value)}
                placeholder="e.g. ** or [ or https://"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Suffix to Append</label>
              <input
                type="text"
                value={props.suffix || ''}
                onChange={(e) => onPropChange('suffix', e.target.value)}
                placeholder="e.g. ** or ] or .html"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Split & Join */}
        {(currentOp === 'split' || currentOp === 'join') && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Delimiter</label>
            <input
              type="text"
              value={props.delimiter ?? (currentOp === 'split' ? ',' : ', ')}
              onChange={(e) => onPropChange('delimiter', e.target.value)}
              placeholder="Delimiter string"
              className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-gray-500 py-0.5">Presets:</span>
              {[
                { label: 'Comma ( , )', val: ',' },
                { label: 'Comma space ( , )', val: ', ' },
                { label: 'Pipe ( | )', val: '|' },
                { label: 'Dash ( - )', val: '-' },
                { label: 'Space ( )', val: ' ' },
                { label: 'Newline ( \\n )', val: '\n' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onPropChange('delimiter', p.val)}
                  className="px-1.5 py-0.5 rounded bg-[#141a29] text-gray-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Count */}
        {currentOp === 'count' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Count Mode</label>
            <select
              value={props.chars || 'chars'}
              onChange={(e) => onPropChange('chars', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="chars">Total Characters</option>
              <option value="words">Word Count</option>
              <option value="lines">Line Count</option>
              <option value="occurrences">Occurrences of Search Term</option>
            </select>
            {props.chars === 'occurrences' && (
              <input
                type="text"
                value={props.search || ''}
                onChange={(e) => onPropChange('search', e.target.value)}
                placeholder="Search substring to count"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            )}
          </div>
        )}

        {/* Clean Price */}
        {currentOp === 'cleanPrice' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Price Extraction Mode</label>
            <select
              value={props.priceMode || 'number_only'}
              onChange={(e) => onPropChange('priceMode', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="number_only">Number only ("$1,299.99" → "1299.99")</option>
              <option value="strip_symbols">Strip currency symbols ("$1,299.99" → "1,299.99")</option>
            </select>
          </div>
        )}

        {/* Format Currency */}
        {currentOp === 'formatCurrency' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Currency Symbol</label>
              <input
                type="text"
                value={props.currencySymbol ?? '$'}
                onChange={(e) => onPropChange('currencySymbol', e.target.value)}
                placeholder="$"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
              <div className="flex gap-1 mt-1">
                {['$', '€', '£', '₹', '¥'].map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => onPropChange('currencySymbol', sym)}
                    className="px-1.5 py-0.5 rounded bg-[#141a29] text-gray-300 hover:text-white border border-[#222d42] text-[10px]"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Decimals</label>
              <input
                type="number"
                min={0}
                max={4}
                value={props.decimals ?? 2}
                onChange={(e) => onPropChange('decimals', Number(e.target.value))}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Round Number */}
        {currentOp === 'roundNumber' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Rounding Method</label>
              <select
                value={props.roundMode || 'round'}
                onChange={(e) => onPropChange('roundMode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="round">Standard (Math.round)</option>
                <option value="floor">Round Down (Math.floor)</option>
                <option value="ceil">Round Up (Math.ceil)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Decimals</label>
              <input
                type="number"
                min={0}
                max={8}
                value={props.decimals ?? 2}
                onChange={(e) => onPropChange('decimals', Number(e.target.value))}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Default Fallback */}
        {currentOp === 'defaultFallback' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Fallback Value if Input is Empty/Null
            </label>
            <input
              type="text"
              value={props.fallbackValue ?? 'N/A'}
              onChange={(e) => onPropChange('fallbackValue', e.target.value)}
              placeholder="e.g. N/A or 0 or Unknown"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
          </div>
        )}

        {/* Normalize URL */}
        {currentOp === 'normalizeUrl' && (
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Base URL Prefix</label>
              <input
                type="text"
                value={props.basePrefix || ''}
                onChange={(e) => onPropChange('basePrefix', e.target.value)}
                placeholder="e.g. https://www.amazon.com"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.stripQueryParams !== false}
                onChange={(e) => onPropChange('stripQueryParams', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[10px]">Strip tracking query parameters (?ref=..., utm_*)</span>
            </label>
          </div>
        )}

        {/* Format Date */}
        {currentOp === 'formatDate' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Date Format Mode</label>
            <select
              value={props.dateMode || 'iso_date'}
              onChange={(e) => onPropChange('dateMode', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="iso_date">ISO Date (YYYY-MM-DD)</option>
              <option value="iso_datetime">ISO DateTime (YYYY-MM-DDTHH:mm:ssZ)</option>
              <option value="timestamp">Timestamp in milliseconds</option>
            </select>
          </div>
        )}

        {/* --- Arrays & Lists Controls --- */}
        {currentOp === 'array_deduplicate' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Deduplicate by Property Key (Optional for primitive arrays)
            </label>
            <input
              type="text"
              value={props.key || props.field || ''}
              onChange={(e) => onPropChange('key', e.target.value)}
              placeholder="e.g. url, id, or email (leave blank to deduplicate whole items)"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
            />
            <div className="flex gap-1">
              <span className="text-[10px] text-gray-500 py-0.5">Common keys:</span>
              {['url', 'id', 'link', 'sku', 'email', 'name'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onPropChange('key', k)}
                  className="px-1.5 py-0.5 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentOp === 'array_filter' && (
          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-300">
                  Filter Condition Expression
                </label>
                <span className="text-[9px] text-gray-500">e.g. price &lt; 50 or in_stock == true</span>
              </div>
              <input
                type="text"
                value={props.filterExpr || props.condition || ''}
                onChange={(e) => {
                  onPropChange('filterExpr', e.target.value);
                  onPropChange('condition', e.target.value);
                }}
                placeholder="e.g. price < 50, in_stock == true, stock > 0"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-indigo-500/40 focus:border-indigo-400 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Condition Presets:</div>
              <div className="flex flex-wrap gap-1">
                {[
                  'price < 50',
                  'in_stock == true',
                  'stock > 0',
                  'rating >= 4.0',
                  'status == "active"',
                  'category == "deals"',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onPropChange('filterExpr', preset);
                      onPropChange('condition', preset);
                    }}
                    className="px-2 py-1 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentOp === 'array_sort' && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Property Key to Sort By (Leave blank for primitive values)
              </label>
              <input
                type="text"
                value={props.sortKey || props.field || ''}
                onChange={(e) => onPropChange('sortKey', e.target.value)}
                placeholder="e.g. price, title, timestamp"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Direction</label>
                <select
                  value={props.sortOrder || 'asc'}
                  onChange={(e) => onPropChange('sortOrder', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                >
                  <option value="asc">Ascending (A → Z, 0 → 9)</option>
                  <option value="desc">Descending (Z → A, 9 → 0)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Sort Type</label>
                <select
                  value={props.sortType || 'auto'}
                  onChange={(e) => onPropChange('sortType', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                >
                  <option value="auto">Auto (Detect Number / String)</option>
                  <option value="numeric">Numeric (1, 2, 10)</option>
                  <option value="alphabetical">Alphabetical</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {currentOp === 'array_chunk' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Batch / Chunk Size (Items per group)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={props.chunkSize ?? props.count ?? 10}
                onChange={(e) => onPropChange('chunkSize', Math.max(1, Number(e.target.value)))}
                className="w-24 bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
              <div className="flex gap-1">
                {[5, 10, 20, 25, 50, 100].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onPropChange('chunkSize', s)}
                    className="px-2 py-1 rounded bg-[#141a29] text-gray-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-gray-500">
              Splits a list of items into sub-arrays for pagination or batch API requests.
            </p>
          </div>
        )}

        {(currentOp === 'array_take' || currentOp === 'array_drop') && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-gray-300">
                Number of Items to {currentOp === 'array_take' ? 'Take' : 'Drop'}
              </label>
              <input
                type="number"
                min={1}
                value={props.count ?? 1}
                onChange={(e) => onPropChange('count', Math.max(0, Number(e.target.value)))}
                className="w-20 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="takeDropMode"
                  checked={props.fromEnd !== true && props.takeMode !== 'last' && props.dropMode !== 'last'}
                  onChange={() => {
                    onPropChange('fromEnd', false);
                    onPropChange('takeMode', 'first');
                    onPropChange('dropMode', 'first');
                  }}
                  className="text-indigo-600"
                />
                <span className="text-[10px]">From Start (First N elements)</span>
              </label>
              <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="takeDropMode"
                  checked={props.fromEnd === true || props.takeMode === 'last' || props.dropMode === 'last'}
                  onChange={() => {
                    onPropChange('fromEnd', true);
                    onPropChange('takeMode', 'last');
                    onPropChange('dropMode', 'last');
                  }}
                  className="text-indigo-600"
                />
                <span className="text-[10px]">From End (Last N elements)</span>
              </label>
            </div>
          </div>
        )}

        {currentOp === 'array_flatten' && (
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={props.deep === true}
              onChange={(e) => onPropChange('deep', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
            />
            <span className="text-[10px]">Deep Flatten (Recursively flatten all nested arrays)</span>
          </label>
        )}

        {/* --- Dates & Timestamps Controls --- */}
        {currentOp === 'date_math' && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Date Math Expression (+7 days, -2 hours, +30 mins, -1 month)
              </label>
              <input
                type="text"
                value={props.dateMathExpr ?? '+7 days'}
                onChange={(e) => onPropChange('dateMathExpr', e.target.value)}
                placeholder="e.g. +7 days, -2 hours, +30 mins"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-indigo-500/40 focus:border-indigo-400 outline-none font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {['+7 days', '-2 hours', '+30 mins', '+1 month', '-1 day', '+1 year'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onPropChange('dateMathExpr', preset)}
                  className="px-2 py-1 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentOp === 'date_relative_parse' && (
          <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-[10px] text-gray-300 space-y-1">
            <p className="font-semibold text-indigo-300">Supported Relative Expressions:</p>
            <p>• "2 hours ago", "yesterday", "tomorrow", "3 days ago", "10 mins ago", "in 5 days", "just now"</p>
            <p className="text-gray-400">Converts natural scraped timestamps into standardized ISO strings.</p>
          </div>
        )}

        {currentOp === 'date_diff' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Compare Date</label>
              <input
                type="text"
                value={props.compareDate || ''}
                onChange={(e) => onPropChange('compareDate', e.target.value)}
                placeholder="e.g. 2026-10-15 or now"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Difference Unit</label>
              <select
                value={props.diffUnit || 'days'}
                onChange={(e) => onPropChange('diffUnit', e.target.value)}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="days">Days</option>
                <option value="hours">Hours</option>
                <option value="minutes">Minutes</option>
                <option value="seconds">Seconds</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>
        )}

        {currentOp === 'date_format_mask' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Format Mask</label>
            <input
              type="text"
              value={props.formatMask ?? 'YYYY-MM-DD'}
              onChange={(e) => onPropChange('formatMask', e.target.value)}
              placeholder="e.g. YYYY-MM-DD or DD/MM/YYYY hh:mm A"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {[
                'YYYY-MM-DD',
                'DD/MM/YYYY',
                'MM/DD/YYYY',
                'YYYY-MM-DD HH:mm:ss',
                'hh:mm A',
                'MMMM D, YYYY',
              ].map((mask) => (
                <button
                  key={mask}
                  type="button"
                  onClick={() => onPropChange('formatMask', mask)}
                  className="px-1.5 py-0.5 rounded bg-[#141a29] text-gray-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {mask}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentOp === 'date_timezone' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Timezone</label>
            <select
              value={props.targetTimezone || 'UTC'}
              onChange={(e) => onPropChange('targetTimezone', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="UTC">UTC (Universal Time Coordinated)</option>
              <option value="local">Local Browser Timezone</option>
              <option value="America/New_York">America/New_York (Eastern)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (Pacific)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            </select>
          </div>
        )}

        {/* --- Booleans & Logic Controls --- */}
        {currentOp === 'boolean_compare' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Operator</label>
              <select
                value={props.operator || '=='}
                onChange={(e) => onPropChange('operator', e.target.value)}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              >
                <option value="==">Equal (==)</option>
                <option value="!=">Not Equal (!=)</option>
                <option value="<">Less Than (&lt;)</option>
                <option value="<=">Less Than or Equal (&lt;=)</option>
                <option value=">">Greater Than (&gt;)</option>
                <option value=">=">Greater Than or Equal (&gt;=)</option>
                <option value="contains">Contains (substring)</option>
                <option value="starts_with">Starts With</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Compare With</label>
              <input
                type="text"
                value={props.compareValue ?? props.value ?? ''}
                onChange={(e) => {
                  onPropChange('compareValue', e.target.value);
                  onPropChange('value', e.target.value);
                }}
                placeholder="Target value"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* --- URLs & Links Controls --- */}
        {currentOp === 'url_extract_param' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Query Parameter Name
            </label>
            <input
              type="text"
              value={props.paramName || props.param || 'v'}
              onChange={(e) => {
                onPropChange('paramName', e.target.value);
                onPropChange('param', e.target.value);
              }}
              placeholder="e.g. v, id, ref, page"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
            />
            <div className="flex gap-1">
              <span className="text-[10px] text-gray-500 py-0.5">Presets:</span>
              {['v', 'id', 'ref', 'page', 'search', 'token'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onPropChange('paramName', p);
                    onPropChange('param', p);
                  }}
                  className="px-1.5 py-0.5 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  ?{p}=
                </button>
              ))}
            </div>
          </div>
        )}

        {currentOp === 'url_extract_domain' && (
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={props.stripWww === true}
              onChange={(e) => onPropChange('stripWww', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
            />
            <span className="text-[10px]">Strip leading "www." (e.g. www.domain.com → domain.com)</span>
          </label>
        )}

        {currentOp === 'url_build_query' && (
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={props.includeQuestionMark !== false}
              onChange={(e) => onPropChange('includeQuestionMark', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
            />
            <span className="text-[10px]">Include leading '?' (e.g. ?search=laptop&page=2)</span>
          </label>
        )}

        {/* --- Numbers & Math Controls --- */}
        {currentOp === 'math_expression' && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Math Expression (use x or val for input value)
              </label>
              <input
                type="text"
                value={props.expression ?? '(x * 1.15)'}
                onChange={(e) => onPropChange('expression', e.target.value)}
                placeholder="e.g. (x * 1.15) + 5 or (a * b) + c"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-indigo-500/40 focus:border-indigo-400 outline-none font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { label: '+15% Tax (x * 1.15)', expr: 'x * 1.15' },
                { label: '-20% Off (x * 0.8)', expr: 'x * 0.8' },
                { label: 'Round (round(x))', expr: 'round(x)' },
                { label: 'C to F ((x * 9/5) + 32)', expr: '(x * 9/5) + 32' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onPropChange('expression', p.expr)}
                  className="px-2 py-1 rounded bg-[#141a29] text-indigo-300 hover:text-white border border-[#222d42] text-[10px] font-mono"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentOp === 'math_clamp' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Minimum Bound</label>
              <input
                type="number"
                value={props.min ?? 0}
                onChange={(e) => onPropChange('min', Number(e.target.value))}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Maximum Bound</label>
              <input
                type="number"
                value={props.max ?? 100}
                onChange={(e) => onPropChange('max', Number(e.target.value))}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {currentOp === 'math_random' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Min Value</label>
                <input
                  type="number"
                  value={props.min ?? 1000}
                  onChange={(e) => onPropChange('min', Number(e.target.value))}
                  placeholder="1000"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Value</label>
                <input
                  type="number"
                  value={props.max ?? 5000}
                  onChange={(e) => onPropChange('max', Number(e.target.value))}
                  placeholder="5000"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.integer !== false}
                onChange={(e) => onPropChange('integer', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[10px]">Integer only (whole numbers for delays)</span>
            </label>
          </div>
        )}

        {currentOp === 'math_aggregate' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Aggregate Type</label>
              <select
                value={props.aggregateType || 'sum'}
                onChange={(e) => onPropChange('aggregateType', e.target.value)}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="sum">Sum (Total)</option>
                <option value="average">Average (Mean)</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Property Key (Optional)</label>
              <input
                type="text"
                value={props.field || ''}
                onChange={(e) => onPropChange('field', e.target.value)}
                placeholder="e.g. price, total"
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. Interactive Live Test & Preview Playground */}
      <div className="p-3 rounded-xl bg-gradient-to-b from-[#10141f] to-[#0c0e17] border border-indigo-500/30 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-xs">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Interactive Live Test & Preview</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-medium px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
            Real-time
          </span>
        </div>

        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Test Sample Input:</label>
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Type any test text here to test this operation instantly..."
            className="w-full bg-[#0a0d14] text-white p-2 rounded-lg border border-[#1f2738] focus:border-indigo-400 outline-none font-mono text-xs"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <ArrowRight className="w-3 h-3 text-indigo-400" />
              <span>Transformed Result:</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#161c2b] text-gray-300 border border-[#222a3d]">
                Type: {livePreview.type}
              </span>
              <button
                type="button"
                onClick={handleCopyResult}
                className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1 py-0.5 px-1 rounded hover:bg-indigo-900/40 transition-colors"
                title="Copy evaluated output"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-black/60 border border-[#202738] font-mono text-xs text-emerald-300 min-h-[36px] flex items-center break-all select-all">
            {livePreview.error ? (
              <span className="text-rose-400">{livePreview.error}</span>
            ) : Array.isArray(livePreview.value) ? (
              <div className="flex flex-wrap gap-1">
                {livePreview.value.map((item, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[10px]"
                  >
                    [{idx}] {String(item)}
                  </span>
                ))}
              </div>
            ) : typeof livePreview.value === 'object' && livePreview.value !== null ? (
              <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(livePreview.value, null, 2)}</pre>
            ) : (
              <span>{JSON.stringify(livePreview.value) || '""'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
