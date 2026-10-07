import React, { useState, useEffect } from 'react';
import {
  Braces,
  Code,
  Copy,
  Download,
  Upload,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileJson,
  Eye,
  RefreshCw,
  Sliders,
  HelpCircle,
} from 'lucide-react';

export interface JsonSchemaProperty {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array[string]' | 'array[object]' | 'object';
  description: string;
  required: boolean;
}

export interface JsonSchemaSectionProps {
  properties: Record<string, any>;
  onPropChange: (key: string, value: any) => void;
  outputVariable: string;
  runtimeOutput?: any;
}

const PRESET_SCHEMAS: Record<
  string,
  {
    name: string;
    description: string;
    schema: Record<string, any>;
    fields: JsonSchemaProperty[];
  }
> = {
  ecommerce: {
    name: 'product_extraction',
    description: 'E-Commerce Product details and pricing',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product title or item name' },
        price: { type: 'number', description: 'Product price in currency numeric amount' },
        currency: { type: 'string', description: 'Currency symbol or ISO code, e.g. USD, EUR' },
        in_stock: { type: 'boolean', description: 'Whether item is currently available for purchase' },
        rating: { type: 'number', description: 'Average review rating between 0 and 5' },
        features: {
          type: 'array',
          items: { type: 'string' },
          description: 'Bullet points of key product features and specs',
        },
      },
      required: ['name', 'price', 'in_stock'],
      additionalProperties: false,
    },
    fields: [
      { id: '1', name: 'name', type: 'string', description: 'Product title or item name', required: true },
      { id: '2', name: 'price', type: 'number', description: 'Product price in currency numeric amount', required: true },
      { id: '3', name: 'currency', type: 'string', description: 'Currency symbol or ISO code, e.g. USD', required: false },
      { id: '4', name: 'in_stock', type: 'boolean', description: 'Whether item is currently available for purchase', required: true },
      { id: '5', name: 'rating', type: 'number', description: 'Average review rating between 0 and 5', required: false },
      { id: '6', name: 'features', type: 'array[string]', description: 'Bullet points of key product features', required: false },
    ],
  },
  chain_of_thought: {
    name: 'math_reasoning',
    description: 'Step-by-step chain of thought reasoning (OpenAI Docs)',
    schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              explanation: { type: 'string', description: 'Reasoning explanation for this step' },
              output: { type: 'string', description: 'Calculated output or result of this step' },
            },
            required: ['explanation', 'output'],
            additionalProperties: false,
          },
          description: 'Step by step chain-of-thought breakdown',
        },
        final_answer: { type: 'string', description: 'The final conclusion or verified result' },
      },
      required: ['steps', 'final_answer'],
      additionalProperties: false,
    },
    fields: [
      { id: '1', name: 'steps', type: 'array[object]', description: 'Step by step chain-of-thought breakdown', required: true },
      { id: '2', name: 'final_answer', type: 'string', description: 'The final conclusion or verified result', required: true },
    ],
  },
  lead_contact: {
    name: 'lead_contact',
    description: 'B2B Lead and Contact Profile',
    schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string', description: 'Contact full name' },
        email: { type: 'string', description: 'Business email address' },
        company: { type: 'string', description: 'Company or organization name' },
        role: { type: 'string', description: 'Job title or role' },
        phone: { type: 'string', description: 'Phone number' },
        linkedin_url: { type: 'string', description: 'LinkedIn or profile URL' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categorization tags',
        },
      },
      required: ['full_name', 'email', 'company'],
      additionalProperties: false,
    },
    fields: [
      { id: '1', name: 'full_name', type: 'string', description: 'Contact full name', required: true },
      { id: '2', name: 'email', type: 'string', description: 'Business email address', required: true },
      { id: '3', name: 'company', type: 'string', description: 'Company or organization name', required: true },
      { id: '4', name: 'role', type: 'string', description: 'Job title or role', required: false },
      { id: '5', name: 'phone', type: 'string', description: 'Phone number', required: false },
      { id: '6', name: 'linkedin_url', type: 'string', description: 'LinkedIn or profile URL', required: false },
      { id: '7', name: 'tags', type: 'array[string]', description: 'Categorization tags', required: false },
    ],
  },
  web_extraction: {
    name: 'article_extraction',
    description: 'Article summary and key takeaways',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Main headline or title' },
        author: { type: 'string', description: 'Author or publication source' },
        summary: { type: 'string', description: 'Executive summary in 2-3 sentences' },
        key_takeaways: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key takeaways and bullet insights',
        },
        sentiment: { type: 'string', description: 'Overall sentiment: positive, negative, or neutral' },
      },
      required: ['title', 'summary', 'key_takeaways'],
      additionalProperties: false,
    },
    fields: [
      { id: '1', name: 'title', type: 'string', description: 'Main headline or title', required: true },
      { id: '2', name: 'author', type: 'string', description: 'Author or publication source', required: false },
      { id: '3', name: 'summary', type: 'string', description: 'Executive summary in 2-3 sentences', required: true },
      { id: '4', name: 'key_takeaways', type: 'array[string]', description: 'Key takeaways and bullet insights', required: true },
      { id: '5', name: 'sentiment', type: 'string', description: 'Overall sentiment: positive, negative, or neutral', required: false },
    ],
  },
  classification: {
    name: 'sentiment_classification',
    description: 'Sentiment, intent & category classification',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Primary topic or issue category' },
        sentiment: { type: 'string', description: 'Positive, Negative, or Neutral' },
        confidence: { type: 'number', description: 'Confidence score from 0.0 to 1.0' },
        urgent: { type: 'boolean', description: 'Requires immediate human intervention' },
        reasoning: { type: 'string', description: 'Short justification for the assigned labels' },
      },
      required: ['category', 'sentiment', 'confidence', 'urgent'],
      additionalProperties: false,
    },
    fields: [
      { id: '1', name: 'category', type: 'string', description: 'Primary topic or issue category', required: true },
      { id: '2', name: 'sentiment', type: 'string', description: 'Positive, Negative, or Neutral', required: true },
      { id: '3', name: 'confidence', type: 'number', description: 'Confidence score from 0.0 to 1.0', required: true },
      { id: '4', name: 'urgent', type: 'boolean', description: 'Requires immediate human intervention', required: true },
      { id: '5', name: 'reasoning', type: 'string', description: 'Short justification for the assigned labels', required: false },
    ],
  },
};

export const JsonSchemaSection: React.FC<JsonSchemaSectionProps> = ({
  properties,
  onPropChange,
  outputVariable,
  runtimeOutput,
}) => {
  const isStructured = !!properties.structuredOutput || !!properties.jsonMode;
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Initialize raw JSON text
  const initialSchema = properties.jsonSchema
    ? typeof properties.jsonSchema === 'string'
      ? properties.jsonSchema
      : JSON.stringify(properties.jsonSchema, null, 2)
    : JSON.stringify(PRESET_SCHEMAS.ecommerce.schema, null, 2);

  const [rawJsonText, setRawJsonText] = useState<string>(initialSchema);

  // Visual fields state
  const [fields, setFields] = useState<JsonSchemaProperty[]>(() => {
    if (properties.jsonSchema && typeof properties.jsonSchema === 'object' && properties.jsonSchema.properties) {
      const p = properties.jsonSchema.properties;
      const req: string[] = Array.isArray(properties.jsonSchema.required) ? properties.jsonSchema.required : [];
      return Object.entries(p).map(([key, val]: [string, any], idx) => ({
        id: String(idx + 1),
        name: key,
        type:
          val.type === 'array'
            ? val.items?.type === 'object'
              ? 'array[object]'
              : 'array[string]'
            : val.type || 'string',
        description: val.description || '',
        required: req.includes(key),
      }));
    }
    return PRESET_SCHEMAS.ecommerce.fields;
  });

  const schemaName = properties.jsonSchemaName || 'structured_output';
  const isStrict = properties.jsonSchemaStrict !== false;

  // Build JSON schema object from visual fields
  const buildSchemaFromFields = (fieldList: JsonSchemaProperty[]): Record<string, any> => {
    const propMap: Record<string, any> = {};
    const requiredKeys: string[] = [];

    fieldList.forEach((f) => {
      if (!f.name.trim()) return;
      if (f.type === 'array[string]') {
        propMap[f.name] = {
          type: 'array',
          items: { type: 'string' },
          ...(f.description ? { description: f.description } : {}),
        };
      } else if (f.type === 'array[object]') {
        propMap[f.name] = {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              value: { type: 'string' },
            },
            additionalProperties: false,
          },
          ...(f.description ? { description: f.description } : {}),
        };
      } else if (f.type === 'object') {
        propMap[f.name] = {
          type: 'object',
          properties: {},
          additionalProperties: false,
          ...(f.description ? { description: f.description } : {}),
        };
      } else {
        propMap[f.name] = {
          type: f.type,
          ...(f.description ? { description: f.description } : {}),
        };
      }

      if (f.required) {
        requiredKeys.push(f.name);
      }
    });

    return {
      type: 'object',
      properties: propMap,
      required: requiredKeys,
      additionalProperties: false,
    };
  };

  const handleApplyPreset = (presetKey: string) => {
    const preset = PRESET_SCHEMAS[presetKey];
    if (!preset) return;
    setFields(preset.fields);
    const pretty = JSON.stringify(preset.schema, null, 2);
    setRawJsonText(pretty);
    setSchemaError(null);
    onPropChange('jsonSchema', preset.schema);
    onPropChange('jsonSchemaName', preset.name);
    onPropChange('structuredOutput', true);
    onPropChange('jsonMode', true);
  };

  const handleFieldChange = (index: number, patch: Partial<JsonSchemaProperty>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...patch };
    setFields(updated);
    const newSchema = buildSchemaFromFields(updated);
    setRawJsonText(JSON.stringify(newSchema, null, 2));
    onPropChange('jsonSchema', newSchema);
  };

  const handleAddField = () => {
    const newField: JsonSchemaProperty = {
      id: String(Date.now()),
      name: `field_${fields.length + 1}`,
      type: 'string',
      description: '',
      required: true,
    };
    const updated = [...fields, newField];
    setFields(updated);
    const newSchema = buildSchemaFromFields(updated);
    setRawJsonText(JSON.stringify(newSchema, null, 2));
    onPropChange('jsonSchema', newSchema);
  };

  const handleDeleteField = (index: number) => {
    const updated = fields.filter((_, i) => i !== index);
    setFields(updated);
    const newSchema = buildSchemaFromFields(updated);
    setRawJsonText(JSON.stringify(newSchema, null, 2));
    onPropChange('jsonSchema', newSchema);
  };

  const handleRawTextChange = (text: string) => {
    setRawJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setSchemaError(null);
      onPropChange('jsonSchema', parsed);

      // Sync back to fields if valid object
      if (parsed.type === 'object' && parsed.properties) {
        const req: string[] = Array.isArray(parsed.required) ? parsed.required : [];
        const reconstructed: JsonSchemaProperty[] = Object.entries(parsed.properties).map(
          ([key, val]: [string, any], idx) => ({
            id: String(idx + 1),
            name: key,
            type:
              val.type === 'array'
                ? val.items?.type === 'object'
                  ? 'array[object]'
                  : 'array[string]'
                : val.type || 'string',
            description: val.description || '',
            required: req.includes(key),
          })
        );
        setFields(reconstructed);
      }
    } catch (err: any) {
      setSchemaError(err.message || 'Invalid JSON syntax');
    }
  };

  const handleDownloadSchema = () => {
    try {
      const blob = new Blob([rawJsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${schemaName}_schema.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export schema:', err);
    }
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(rawJsonText);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  const handleDownloadOutput = () => {
    if (!runtimeOutput) return;
    try {
      const str =
        typeof runtimeOutput === 'object'
          ? JSON.stringify(runtimeOutput, null, 2)
          : String(runtimeOutput);
      const blob = new Blob([str], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${outputVariable}_output.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download output:', err);
    }
  };

  const handleCopyOutput = () => {
    if (!runtimeOutput) return;
    const str =
      typeof runtimeOutput === 'object'
        ? JSON.stringify(runtimeOutput, null, 2)
        : String(runtimeOutput);
    navigator.clipboard.writeText(str);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  return (
    <div className="space-y-3 pt-3 border-t border-[#1c2230]">
      {/* Enable Structured Outputs Toggle */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-indigo-500/20 text-indigo-400">
              <FileJson className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <span>Structured Model Output</span>
                <span className="px-1.5 py-0.2 rounded bg-indigo-950 border border-indigo-500/40 text-[9px] text-indigo-300 font-mono">
                  JSON Schema
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                Guarantees the model strictly adheres to your JSON schema without omissions or hallucinations.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={isStructured}
              onChange={(e) => {
                const checked = e.target.checked;
                onPropChange('structuredOutput', checked);
                onPropChange('jsonMode', checked);
                if (checked) {
                  onPropChange('outputFormat', 'json');
                  if (!properties.jsonSchema) {
                    onPropChange('jsonSchema', PRESET_SCHEMAS.ecommerce.schema);
                  }
                }
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[#1a2130] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      </div>

      {isStructured && (
        <div className="space-y-3">
          {/* Quick Preset Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-gray-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Schema Templates</span>
              </span>
              <span className="text-[10px] text-gray-500">1-click setup</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset('ecommerce')}
                className="p-1.5 px-2 rounded-lg bg-[#141924] hover:bg-indigo-950/60 border border-[#232b3d] hover:border-indigo-500/40 text-[10px] text-gray-300 hover:text-indigo-200 text-left transition-colors flex items-center justify-between"
              >
                <span>🛒 E-Commerce</span>
                <span className="text-[9px] text-gray-500">Price & Specs</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('chain_of_thought')}
                className="p-1.5 px-2 rounded-lg bg-[#141924] hover:bg-indigo-950/60 border border-[#232b3d] hover:border-indigo-500/40 text-[10px] text-gray-300 hover:text-indigo-200 text-left transition-colors flex items-center justify-between"
              >
                <span>🧠 Chain of Thought</span>
                <span className="text-[9px] text-gray-500">Steps + Answer</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('web_extraction')}
                className="p-1.5 px-2 rounded-lg bg-[#141924] hover:bg-indigo-950/60 border border-[#232b3d] hover:border-indigo-500/40 text-[10px] text-gray-300 hover:text-indigo-200 text-left transition-colors flex items-center justify-between"
              >
                <span>📄 Article / Web</span>
                <span className="text-[9px] text-gray-500">Summary & Points</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('lead_contact')}
                className="p-1.5 px-2 rounded-lg bg-[#141924] hover:bg-indigo-950/60 border border-[#232b3d] hover:border-indigo-500/40 text-[10px] text-gray-300 hover:text-indigo-200 text-left transition-colors flex items-center justify-between"
              >
                <span>👤 Lead / Profile</span>
                <span className="text-[9px] text-gray-500">Email, Company</span>
              </button>
            </div>
          </div>

          {/* Mode Switcher & Tools Toolbar */}
          <div className="flex items-center justify-between pt-1">
            <div className="inline-flex rounded-lg bg-[#10131d] p-0.5 border border-[#1e273a]">
              <button
                type="button"
                onClick={() => setEditorMode('visual')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1.5 transition-all ${
                  editorMode === 'visual'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>Visual Designer</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('code')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1.5 transition-all ${
                  editorMode === 'code'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Code className="w-3 h-3" />
                <span>JSON Schema Code</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopySchema}
                className="p-1.5 rounded-lg bg-[#141924] hover:bg-[#1f2738] text-gray-300 hover:text-white border border-[#242e42] text-[10px] flex items-center gap-1"
                title="Copy JSON Schema"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSchema ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSchema}
                className="p-1.5 rounded-lg bg-[#141924] hover:bg-[#1f2738] text-gray-300 hover:text-white border border-[#242e42] text-[10px] flex items-center gap-1"
                title="Download JSON Schema file"
              >
                <Download className="w-3 h-3" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Schema Metadata: Name & Strict Mode */}
          <div className="grid grid-cols-2 gap-2 bg-[#0d1017] p-2.5 rounded-xl border border-[#1c2333]">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Schema Name</label>
              <input
                type="text"
                value={schemaName}
                onChange={(e) => onPropChange('jsonSchemaName', e.target.value)}
                placeholder="e.g. product_info"
                className="w-full bg-[#141924] text-white p-1.5 rounded border border-[#252f44] text-[11px] font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Strict Mode (OpenAI)</label>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isStrict}
                  onChange={(e) => onPropChange('jsonSchemaStrict', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px] text-indigo-300 font-medium">Enforce Strict Schema</span>
              </label>
            </div>
          </div>

          {/* Visual Fields Builder */}
          {editorMode === 'visual' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-gray-400 px-0.5">
                <span>Schema Properties ({fields.length})</span>
                <span className="text-[10px] text-indigo-400 font-mono">root: object</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {fields.map((field, idx) => (
                  <div
                    key={field.id || idx}
                    className="p-2.5 rounded-xl bg-[#10141e] border border-[#1d2538] hover:border-indigo-500/30 transition-colors space-y-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => handleFieldChange(idx, { name: e.target.value })}
                        placeholder="property_name"
                        className="flex-1 bg-[#161c2b] text-white px-2 py-1 rounded border border-[#273248] text-xs font-mono outline-none focus:border-indigo-500"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => handleFieldChange(idx, { type: e.target.value as any })}
                        className="bg-[#161c2b] text-indigo-300 px-2 py-1 rounded border border-[#273248] text-[11px] outline-none"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="array[string]">array of strings</option>
                        <option value="array[object]">array of objects</option>
                        <option value="object">object</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteField(idx)}
                        className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                        title="Delete property"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.description}
                        onChange={(e) => handleFieldChange(idx, { description: e.target.value })}
                        placeholder="Description (guides the model what to extract)"
                        className="flex-1 bg-[#131722] text-gray-300 px-2 py-0.5 rounded border border-[#20293d] text-[10px] outline-none"
                      />
                      <label className="flex items-center gap-1 cursor-pointer shrink-0 text-[10px] text-gray-300">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleFieldChange(idx, { required: e.target.checked })}
                          className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                        />
                        <span>Required</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddField}
                className="w-full py-1.5 px-3 rounded-lg border border-dashed border-[#29364f] hover:border-indigo-500/50 hover:bg-indigo-950/20 text-indigo-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Property</span>
              </button>
            </div>
          )}

          {/* Code Editor Mode */}
          {editorMode === 'code' && (
            <div className="space-y-1.5">
              <div className="relative">
                <textarea
                  value={rawJsonText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  rows={10}
                  className="w-full bg-[#0a0d14] text-emerald-400 font-mono text-[11px] p-2.5 rounded-xl border border-[#1f283d] outline-none leading-relaxed resize-y"
                  placeholder="Paste or write valid JSON Schema here..."
                />
              </div>

              {schemaError ? (
                <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[10px] text-rose-300 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span className="font-mono truncate">{schemaError}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[10px] text-emerald-400 px-1">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Valid JSON Schema</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(rawJsonText);
                        setRawJsonText(JSON.stringify(parsed, null, 2));
                      } catch {}
                    }}
                    className="text-gray-400 hover:text-indigo-300 underline"
                  >
                    Format Code
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Output Variables Reference Pillbox */}
          <div className="p-2.5 rounded-xl bg-[#0f131e] border border-[#1e2639] space-y-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Output Variables Available:
            </span>
            <div className="flex flex-wrap gap-1">
              <code className="text-[9px] font-mono text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/30">
                &#123;&#123;{outputVariable}&#125;&#125; (Parsed Object)
              </code>
              <code className="text-[9px] font-mono text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/30">
                &#123;&#123;{outputVariable}_json&#125;&#125; (Formatted JSON)
              </code>
              <code className="text-[9px] font-mono text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/30">
                &#123;&#123;{outputVariable}_raw&#125;&#125; (Raw Model Text)
              </code>
              {fields.slice(0, 3).map((f) => (
                <code
                  key={f.name}
                  className="text-[9px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/30"
                >
                  &#123;&#123;{outputVariable}_{f.name}&#125;&#125;
                </code>
              ))}
            </div>
          </div>

          {/* Export / Download Generated JSON Output */}
          {runtimeOutput !== undefined && runtimeOutput !== null && (
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Generated JSON Output</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    className="px-2 py-0.5 rounded bg-[#131b28] hover:bg-[#1c273a] text-gray-200 hover:text-white border border-[#25354d] text-[10px] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedOutput ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadOutput}
                    className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white border border-emerald-500/40 text-[10px] flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download JSON</span>
                  </button>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-black/60 border border-[#1b2536] max-h-40 overflow-y-auto font-mono text-[10px] text-gray-200 whitespace-pre-wrap select-all">
                {typeof runtimeOutput === 'object'
                  ? JSON.stringify(runtimeOutput, null, 2)
                  : String(runtimeOutput)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
