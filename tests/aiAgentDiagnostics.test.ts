import { describe, it, expect } from 'vitest';
import { parseApiError } from '../src/ai/aiService';
import { formatAiAgentDocument } from '../src/utils/documentExporter';

describe('AI Agent Specific Error Diagnostics & Normal Format', () => {
  describe('parseApiError', () => {
    it('diagnoses 401 Unauthorized as invalid API key or permission denial', () => {
      const diag = parseApiError(new Error('HTTP 401: Unauthorized'), 'openai', 'gpt-4o');
      expect(diag).toContain('Invalid API Key or Unauthorized');
      expect(diag).toContain('openai');
      expect(diag).toContain('AutoFlow AI Settings');
    });

    it('diagnoses 429 Rate Limit / Quota Exceeded with actionable recommendations', () => {
      const diag = parseApiError(new Error('Rate limit reached for requests: 429'), 'gemini', 'gemini-1.5-pro');
      expect(diag).toContain('Rate Limit or Quota Exceeded');
      expect(diag).toContain('gemini');
      expect(diag).toContain('billing');
    });

    it('diagnoses 404 Model Not Found with model and provider context', () => {
      const diag = parseApiError(new Error('Model not found 404'), 'anthropic', 'claude-3-5-sonnet');
      expect(diag).toContain('Model Not Found');
      expect(diag).toContain('claude-3-5-sonnet');
    });

    it('diagnoses 400 Context Length / Max Tokens Exceeded', () => {
      const diag = parseApiError(new Error('Context length exceeded: 400 maximum tokens 8192'), 'openai', 'gpt-4o');
      expect(diag).toContain('Context Window Exceeded');
      expect(diag).toContain('reduce the page content');
    });

    it('diagnoses 500 / 503 Provider Server Outage', () => {
      const diag = parseApiError(new Error('503 Service Unavailable'), 'deepseek', 'deepseek-chat');
      expect(diag).toContain('Service Outage / Server Error');
      expect(diag).toContain('deepseek');
    });

    it('diagnoses missing API key specifically', () => {
      const diag = parseApiError(new Error('No API key provided for openai'), 'openai');
      expect(diag).toContain('API Key is Missing');
    });

    it('diagnoses network connectivity and CORS blocks', () => {
      const diag = parseApiError(new Error('Failed to fetch'), 'custom', 'llama-3');
      expect(diag).toContain('Network Connection / CORS Error');
    });
  });

  describe('formatAiAgentDocument with "normal" format', () => {
    it('returns raw text directly without document wrapping when format is "normal"', async () => {
      const rawResponse = 'Hello, this is pure unstructured text without formatting.';
      const result = await formatAiAgentDocument(rawResponse, 'normal', 'my-query');

      expect(result.format).toBe('normal');
      expect(result.data).toBe(rawResponse);
      expect(result.downloadUrl).toBeUndefined();
      expect(result.sizeBytes).toBe(rawResponse.length);
    });

    it('does not format into CSV or base64 dataUrl when normal format is chosen', async () => {
      const tableText = 'Name, Age\nAlice, 30\nBob, 25';
      const result = await formatAiAgentDocument(tableText, 'normal');

      expect(result.format).toBe('normal');
      expect(result.data).toBe(tableText);
      expect(result.dataUrl).toBe('');
      expect(result.filename).toBe('');
    });

    it('formats into valid json document when format is "json"', async () => {
      const jsonText = '{"status": "ok", "items": [1, 2, 3]}';
      const result = await formatAiAgentDocument(jsonText, 'json');

      expect(result.format).toBe('json');
      expect(result.dataUrl).toContain('data:application/json');
      expect(result.filename).toContain('.json');
    });

    it('formats into plain text file when format is "txt"', async () => {
      const text = 'Simple log message';
      const result = await formatAiAgentDocument(text, 'txt');

      expect(result.format).toBe('txt');
      expect(result.dataUrl).toContain('data:text/plain');
      expect(result.filename).toContain('.txt');
    });
  });
});
