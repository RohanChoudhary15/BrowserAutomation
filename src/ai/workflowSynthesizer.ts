import { WorkflowNode, WorkflowEdge, NodeType } from '../types/workflow';
import { SynthesisRequest, SynthesizedWorkflow } from './types';
import { queryLlm, getAiConfig } from './aiService';
import { NODE_REGISTRY } from '../nodes/registry';
import { generateId } from '../utils/id';

const SYSTEM_PROMPT = `You are AutoFlow AI, an expert browser automation architect.
Your task is to convert a user's natural language request into a valid browser automation workflow graph.

Available node types:
- Browser: navigate (url), reload, back, forward, new_tab, close_tab
- Interaction: click (selector, clickType), type_text (selector, text, clearExisting), hover (selector), press_key (key, selector), scroll (direction, amount), select_dropdown (selector, value)
- Wait: wait (duration), wait_for_element (selector, timeout, visible), wait_for_text (text, selector), wait_for_navigation (urlPattern)
- Extraction: extract_text (selector, outputVariable), extract_multiple (selector, attribute, outputVariable), extract_table (selector, outputVariable), extract_links (selector, outputVariable)
- Logic: condition (leftValue, operator, rightValue) -> has output handles 'true' and 'false'; contains (selector, matchMode, text) -> checks if an element/text is present on the page, has output handles 'true' and 'false'
- Data: set_variable (name, value), transform (input, operation, outputVariable), generate_data (dataType, outputVariable)
- Utility: screenshot (outputVariable), execute_javascript (code, outputVariable), http_request (method, url, headers, body, outputVariable), ai_agent (prompt, model, outputVariable)

Output strictly valid JSON with this format:
{
  "summary": "Brief description of the workflow",
  "nodes": [
    {
      "id": "node_1",
      "type": "customNode", // or "conditionNode" for condition, "containsNode" for contains, "loopNode" for loop
      "data": {
        "label": "Navigate",
        "category": "browser",
        "type": "navigate",
        "properties": { "url": "https://..." }
      }
    }
  ],
  "edges": [
    {
      "id": "e_1",
      "source": "node_1",
      "target": "node_2",
      "sourceHandle": "true" // only for conditionNode / containsNode true-false branches
    }
  ]
}`;

/**
 * Built-in Semantic Synthesizer for zero-config / offline workflow generation
 */
export function synthesizeWithSemanticParser(request: SynthesisRequest): SynthesizedWorkflow {
  const prompt = request.prompt.toLowerCase();
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  let currentY = request.mode === 'append' && request.currentNodes && request.selectedNodeId
    ? (request.currentNodes.find(n => n.id === request.selectedNodeId)?.position.y || 100) + 140
    : 50;

  const baseX = request.mode === 'append' && request.currentNodes && request.selectedNodeId
    ? (request.currentNodes.find(n => n.id === request.selectedNodeId)?.position.x || 250)
    : 250;

  // 1. Detect Navigation
  const urlMatch = request.prompt.match(/(https?:\/\/[^\s"',]+)/i);
  if (urlMatch || prompt.includes('navigate') || prompt.includes('open') || prompt.includes('go to')) {
    const url = urlMatch ? urlMatch[1] : 'https://example.com';
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: `Navigate to ${new URL(url).hostname || url}`,
        category: 'browser',
        type: 'navigate',
        properties: { url, waitUntil: 'load', timeout: 20000 },
      },
    });
    currentY += 130;
  }

  // 2. Detect Wait
  if (prompt.includes('wait for') || prompt.includes('wait 3s') || prompt.includes('wait 2s') || prompt.includes('delay')) {
    const id = generateId('ai_node');
    if (prompt.includes('element') || prompt.includes('#') || prompt.includes('.')) {
      nodes.push({
        id,
        type: 'customNode',
        position: { x: baseX, y: currentY },
        data: {
          label: 'Wait For Element',
          category: 'wait',
          type: 'wait_for_element',
          properties: { selector: '.main-content, h1, body', timeout: 10000, visible: true },
        },
      });
    } else {
      nodes.push({
        id,
        type: 'customNode',
        position: { x: baseX, y: currentY },
        data: {
          label: 'Wait Delay',
          category: 'wait',
          type: 'wait',
          properties: { duration: 2000 },
        },
      });
    }
    currentY += 130;
  }

  // 3. Detect Typing / Input
  if (prompt.includes('type') || prompt.includes('fill') || prompt.includes('search for') || prompt.includes('enter')) {
    const id = generateId('ai_node');
    const searchMatch = request.prompt.match(/(?:type|search for|enter)\s+["']?([^"',]+)["']?/i);
    const textToType = searchMatch ? searchMatch[1].trim() : 'Search Query';

    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: `Type "${textToType}"`,
        category: 'interaction',
        type: 'type_text',
        properties: {
          selector: 'input[type="text"], input[type="search"], input[name="q"], input',
          text: textToType,
          clearExisting: true,
          timeout: 10000,
        },
      },
    });
    currentY += 130;
  }

  // 4. Detect Click / Submit
  if (prompt.includes('click') || prompt.includes('press') || prompt.includes('submit')) {
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'Click Button',
        category: 'interaction',
        type: 'click',
        properties: {
          selector: 'button[type="submit"], button.btn-primary, button:has-text("Submit"), [data-testid="submit"]',
          clickType: 'left',
          timeout: 10000,
        },
      },
    });
    currentY += 130;
  }

  // 5. Detect Extraction (Text, Multiple, Table)
  if (prompt.includes('extract') || prompt.includes('scrape') || prompt.includes('get text') || prompt.includes('read')) {
    const id = generateId('ai_node');
    if (prompt.includes('table')) {
      nodes.push({
        id,
        type: 'customNode',
        position: { x: baseX, y: currentY },
        data: {
          label: 'Extract Table',
          category: 'extraction',
          type: 'extract_table',
          properties: { selector: 'table', outputVariable: 'tableData', timeout: 10000 },
        },
      });
    } else if (prompt.includes('multiple') || prompt.includes('all') || prompt.includes('list')) {
      nodes.push({
        id,
        type: 'customNode',
        position: { x: baseX, y: currentY },
        data: {
          label: 'Extract All Items',
          category: 'extraction',
          type: 'extract_multiple',
          properties: { selector: '.item-title, .title, h2, a', outputVariable: 'itemsList', timeout: 10000 },
        },
      });
    } else {
      nodes.push({
        id,
        type: 'customNode',
        position: { x: baseX, y: currentY },
        data: {
          label: 'Extract Text',
          category: 'extraction',
          type: 'extract_text',
          properties: { selector: 'h1, .price, .title', outputVariable: 'extractedContent', timeout: 10000 },
        },
      });
    }
    currentY += 130;
  }

  // 6. Detect AI Agent Node in prompt
  if (prompt.includes('ai') || prompt.includes('llm') || prompt.includes('summarize') || prompt.includes('classify')) {
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'AI Agent Analysis',
        category: 'utility',
        type: 'ai_agent',
        properties: {
          prompt: 'Analyze and summarize the extracted data: {{extractedContent}}',
          model: 'gpt-5.6-sol',
          outputVariable: 'aiSummary',
          jsonMode: false,
        },
      },
    });
    currentY += 130;
  }

  // 7. Detect Condition & Branching
  let hasCondition = false;
  let condNodeId = '';
  if (prompt.includes('if') || prompt.includes('condition') || prompt.includes('check')) {
    hasCondition = true;
    condNodeId = generateId('ai_cond');
    nodes.push({
      id: condNodeId,
      type: 'conditionNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'Check Condition',
        category: 'logic',
        type: 'condition',
        properties: {
          leftValue: '{{extractedContent}}',
          operator: 'is_not_empty',
          rightValue: '',
        },
      },
    });
    currentY += 140;
  }

  // 8. Detect Screenshot
  if (prompt.includes('screenshot') || prompt.includes('capture') || prompt.includes('picture')) {
    const id = generateId('ai_node');
    const posX = hasCondition ? baseX - 80 : baseX;
    nodes.push({
      id,
      type: 'customNode',
      position: { x: posX, y: currentY },
      data: {
        label: 'Capture Screenshot',
        category: 'utility',
        type: 'screenshot',
        properties: { outputVariable: 'pageScreenshot' },
      },
    });
    currentY += 130;
  }

  // 9. Detect HTTP / Webhook / Storage
  if (prompt.includes('webhook') || prompt.includes('api') || prompt.includes('post to') || prompt.includes('http')) {
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'Send Webhook',
        category: 'utility',
        type: 'http_request',
        properties: {
          method: 'POST',
          url: 'https://httpbin.org/post',
          headers: { 'Content-Type': 'application/json' },
          body: { status: 'Automated notification', timestamp: '{{timestamp}}' },
          outputVariable: 'webhookResult',
        },
      },
    });
    currentY += 130;
  }

  // 10. Detect Messaging (Telegram, Discord, Slack)
  if (prompt.includes('telegram')) {
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'Send Telegram Message',
        category: 'messaging',
        type: 'telegram_message',
        properties: {
          botToken: '{{telegramToken}}',
          chatId: '{{chatId}}',
          message: 'AutoFlow Notification: {{extractedContent}}',
          parseMode: 'HTML',
          silent: false,
          outputVariable: 'telegramResponse',
        },
      },
    });
    currentY += 130;
  }

  if (prompt.includes('discord')) {
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'Send Discord Message',
        category: 'messaging',
        type: 'discord_message',
        properties: {
          mode: 'webhook',
          webhookUrl: '{{discordWebhookUrl}}',
          content: 'AutoFlow Notification: {{extractedContent}}',
          username: 'AutoFlow Bot',
          outputVariable: 'discordResponse',
        },
      },
    });
    currentY += 130;
  }

  if (prompt.includes('slack')) {
    const id = generateId('ai_node');
    nodes.push({
      id,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label: 'Send Slack Message',
        category: 'messaging',
        type: 'slack_message',
        properties: {
          mode: 'webhook',
          webhookUrl: '{{slackWebhookUrl}}',
          text: 'AutoFlow Notification: {{extractedContent}}',
          outputVariable: 'slackResponse',
        },
      },
    });
    currentY += 130;
  }

  // Connect linear edges or branching edges
  for (let i = 0; i < nodes.length - 1; i++) {
    const source = nodes[i];
    const target = nodes[i + 1];

    if (source.data.type === 'condition') {
      edges.push({
        id: generateId('ai_edge'),
        source: source.id,
        target: target.id,
        sourceHandle: 'true',
        label: 'TRUE',
        animated: true,
      });
    } else {
      edges.push({
        id: generateId('ai_edge'),
        source: source.id,
        target: target.id,
        animated: true,
      });
    }
  }

  return {
    nodes,
    edges,
    summary: `Synthesized ${nodes.length} nodes for "${request.prompt}"`,
  };
}

/**
 * Main synthesis entrypoint: uses LLM if configured, falls back to semantic parser
 */
export async function synthesizeWorkflow(request: SynthesisRequest): Promise<SynthesizedWorkflow> {
  const config = await getAiConfig();

  if (config.provider !== 'built-in' && config.apiKey) {
    try {
      const responseText = await queryLlm(request.prompt, SYSTEM_PROMPT, config);
      // Clean JSON markdown if wrapped in ```json ... ```
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        // Compute clean vertical grid coordinates
        let currentY = 50;
        const layoutNodes = parsed.nodes.map((n: any, index: number) => {
          const y = currentY;
          currentY += 130;
          return {
            ...n,
            id: n.id || generateId('ai_node'),
            type: NODE_REGISTRY[n.data?.type as NodeType]?.reactFlowType || 'customNode',
            position: n.position || { x: 250, y },
          };
        });

        return {
          nodes: layoutNodes,
          edges: parsed.edges.map((e: any) => ({
            ...e,
            id: e.id || generateId('ai_edge'),
            animated: true,
          })),
          summary: parsed.summary || 'AI-generated workflow',
        };
      }
    } catch (err: any) {
      console.warn('LLM synthesis failed or malformed, falling back to built-in semantic synthesizer:', err);
      const fallback = synthesizeWithSemanticParser(request);
      return {
        ...fallback,
        warning: `AI Provider (${config.provider}) Error: ${err.message || String(err)}`,
        error: err.message || String(err),
      };
    }
  }

  // Built-in intelligent fallback
  return synthesizeWithSemanticParser(request);
}
