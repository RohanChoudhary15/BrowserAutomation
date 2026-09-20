import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/workflow';
import { autoLayoutNodes } from '../../utils/autoLayout';

const b2bRawNodes: WorkflowNode[] = [
  {
    id: 'b2b_nav',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Open Hiring Directory',
      category: 'browser',
      type: 'navigate',
      properties: {
        url: 'https://news.ycombinator.com/jobs',
        waitUntil: 'load',
        timeout: 20000,
      },
    },
  },
  {
    id: 'b2b_wait',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Wait for Opportunities',
      category: 'wait',
      type: 'wait_for_element',
      properties: {
        selector: '.athing',
        timeout: 10000,
        visible: true,
      },
    },
  },
  {
    id: 'b2b_ext_listings',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Hiring Headlines',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: '.titleline > a',
        outputVariable: 'rawHiringListings',
        timeout: 10000,
      },
    },
  },
  {
    id: 'b2b_ext_dates',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Post Timestamps',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: '.subtext .age a',
        outputVariable: 'postingAges',
        timeout: 10000,
      },
    },
  },
  {
    id: 'b2b_clean_js',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Parse & Normalize Leads',
      category: 'utility',
      type: 'execute_javascript',
      properties: {
        code: `const listings = variables.rawHiringListings || [];
const ages = variables.postingAges || [];
return listings.slice(0, 15).map((text, i) => {
  const str = String(text);
  const parts = str.split(' is hiring ');
  const company = parts[0] || str.split(' ')[0] || 'Tech Venture';
  const role = parts[1] || str;
  return {
    leadId: 'LEAD-' + (1001 + i),
    company: company.trim(),
    role: role.trim(),
    postedAgo: String(ages[i] || 'recent'),
    isHighPriority: /senior|staff|lead|director|head|vp/i.test(str)
  };
});`,
        outputVariable: 'prospectsList',
      },
    },
  },
  {
    id: 'b2b_ai_score',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'AI ICP Fit Scoring (JSON)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Evaluate these enterprise technology hiring leads: {{prospectsList}}. For each lead, assign: 1. Target tech sector, 2. ICP fit score (0-100), 3. Key value proposition angle. Return as JSON array.',
        outputFormat: 'json',
        jsonMode: true,
        outputVariable: 'scoredLeads',
      },
    },
  },
  {
    id: 'b2b_ai_csv',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Generate Lead CSV Export',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Format these evaluated leads into a clean CSV spreadsheet with headers Company, Role, Sector, ICPScore, ValueAngle: {{scoredLeads}}',
        outputFormat: 'csv',
        downloadFilename: 'qualified_b2b_prospects',
        autoDownload: true,
        outputVariable: 'leadsCsv',
      },
    },
  },
  {
    id: 'b2b_cond_leads',
    type: 'conditionNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Export Ready & Leads Present (AND)',
      category: 'logic',
      type: 'condition',
      properties: {
        gate: 'AND',
        conditions: [
          {
            leftValue: '{{leadsCsv_filename}}',
            operator: 'is_not_empty',
            rightValue: '',
          },
          {
            leftValue: '{{prospectsList}}',
            operator: 'is_not_empty',
            rightValue: '',
          },
        ],
        leftValue: '{{leadsCsv_filename}}',
        operator: 'is_not_empty',
        rightValue: '',
      },
    },
  },
  {
    id: 'b2b_telegram_alert',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Alert Sales on Telegram',
      category: 'messaging',
      type: 'telegram_message',
      properties: {
        chatId: '-100123456789',
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        messageType: 'text',
        message: '🎯 *New High-Value B2B Prospects Qualified*\n- Pipeline Export: {{leadsCsv_filename}}\n- Status: Scored and ready for sales cadence.',
        outputVariable: 'telegramResult',
      },
    },
  },
  {
    id: 'b2b_slack_sync',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Sync to Slack #leads',
      category: 'messaging',
      type: 'slack_message',
      properties: {
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXXX',
        messageType: 'blocks',
        channel: '#sales-prospects',
        message: '🚀 **Qualified Lead Batch Ingested**\n- File: {{leadsCsv_filename}}',
        outputVariable: 'slackResult',
      },
    },
  },
  {
    id: 'b2b_notify',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Notify Sales Rep',
      category: 'utility',
      type: 'show_notification',
      properties: {
        title: 'B2B Pipeline Enriched',
        message: 'Scored leads and exported CSV to downloads.',
        outputVariable: 'desktopAlert',
      },
    },
  },
];

const b2bEdges: WorkflowEdge[] = [
  { id: 'e_b2b_1', source: 'b2b_nav', target: 'b2b_wait', animated: true },
  { id: 'e_b2b_2', source: 'b2b_wait', target: 'b2b_ext_listings', animated: true },
  { id: 'e_b2b_3', source: 'b2b_ext_listings', target: 'b2b_ext_dates', animated: true },
  { id: 'e_b2b_4', source: 'b2b_ext_dates', target: 'b2b_clean_js', animated: true },
  { id: 'e_b2b_5', source: 'b2b_clean_js', target: 'b2b_ai_score', animated: true },
  { id: 'e_b2b_6', source: 'b2b_ai_score', target: 'b2b_ai_csv', animated: true },
  { id: 'e_b2b_7', source: 'b2b_ai_csv', target: 'b2b_cond_leads', animated: true },
  { id: 'e_b2b_8', source: 'b2b_cond_leads', target: 'b2b_telegram_alert', sourceHandle: 'true', label: 'TRUE', animated: true },
  { id: 'e_b2b_9', source: 'b2b_telegram_alert', target: 'b2b_slack_sync', animated: true },
  { id: 'e_b2b_10', source: 'b2b_slack_sync', target: 'b2b_notify', animated: true },
];

export const B2B_LEAD_ENRICHMENT_WORKFLOW: Workflow = {
  id: 'tpl_b2b_lead_pipeline',
  name: 'B2B Lead Enrichment & AI Scoring Pipeline',
  description: 'Enterprise sales intelligence automation: Ingests technical hiring directories, normalizes company prospects, uses an AI Agent to evaluate ICP fit and score leads (0-100), outputs an RFC-compliant CSV spreadsheet, alerts sales reps via Telegram Bot, and syncs to Slack.',
  version: 2,
  createdAt: 1710000002000,
  updatedAt: 1710000002000,
  variables: {},
  settings: {
    timeout: 30000,
    retryCount: 1,
    retryDelay: 1000,
    stopOnError: true,
    highlightElements: true,
    humanMode: true,
    humanIntensity: 'cautious',
    humanCursor: true,
  },
  nodes: autoLayoutNodes(b2bRawNodes, b2bEdges, { direction: 'TB', rankSep: 70, nodeSep: 70 }),
  edges: b2bEdges,
};
