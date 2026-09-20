import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/workflow';
import { autoLayoutNodes } from '../../utils/autoLayout';

const techRawNodes: WorkflowNode[] = [
  {
    id: 'tech_nav',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Open Tech Community',
      category: 'browser',
      type: 'navigate',
      properties: {
        url: 'https://news.ycombinator.com',
        waitUntil: 'load',
        timeout: 20000,
      },
    },
  },
  {
    id: 'tech_scroll',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Smart Scroll Stories',
      category: 'interaction',
      type: 'smart_scroll',
      properties: {
        passes: 2,
        distance: 600,
        delayMs: 400,
        scrollMode: 'down',
      },
    },
  },
  {
    id: 'tech_ext_titles',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Front Page Titles',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: '.titleline > a',
        outputVariable: 'techHeadlines',
        timeout: 10000,
      },
    },
  },
  {
    id: 'tech_ext_scores',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Upvote Points',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: '.subtext .score',
        outputVariable: 'headlinePoints',
        timeout: 10000,
      },
    },
  },
  {
    id: 'tech_js_filter',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Filter AI & Tooling Signals',
      category: 'utility',
      type: 'execute_javascript',
      properties: {
        code: `const titles = variables.techHeadlines || [];
const scores = variables.headlinePoints || [];
return titles.map((t, idx) => ({
  rank: idx + 1,
  headline: String(t),
  upvotes: parseInt(String(scores[idx] || '0').replace(/\\D/g, ''), 10) || 0,
  hasAiTag: /ai|llm|gpt|agent|model|vision|code/i.test(String(t))
}));`,
        outputVariable: 'curatedTechStories',
      },
    },
  },
  {
    id: 'tech_ai_xlsx',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Generate Tech Trend Matrix (.xlsx)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Analyze these trending technology stories: {{curatedTechStories}}. Identify the dominant software engineering frameworks, AI shifts, and commercial implications. Output a structured Excel table with TechTrend, Category, VelocityScore, EnterpriseImpact.',
        outputFormat: 'xlsx',
        downloadFilename: 'tech_trend_intelligence_matrix',
        autoDownload: true,
        outputVariable: 'techTrendExcel',
      },
    },
  },
  {
    id: 'tech_ai_pdf',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Generate CTO Dossier (.pdf)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Author an Executive Briefing for a Chief Technology Officer (CTO) based on: {{curatedTechStories}}. Highlight strategic opportunities, architecture risks, and competitive technology shifts.',
        outputFormat: 'pdf',
        downloadFilename: 'cto_market_dossier',
        autoDownload: false,
        outputVariable: 'ctoPdf',
      },
    },
  },
  {
    id: 'tech_snap',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Capture Front Page Evidence',
      category: 'utility',
      type: 'screenshot',
      properties: {
        outputVariable: 'techFeedSnapshot',
      },
    },
  },
  {
    id: 'tech_discord',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Post to Developer Discord',
      category: 'messaging',
      type: 'discord_message',
      properties: {
        webhookUrl: 'https://discord.com/api/webhooks/YOUR_DEV_WEBHOOK',
        messageType: 'embed',
        message: '💡 **CTO Technology Scan & Talent Intelligence**\n- Trend Matrix: {{techTrendExcel_filename}}\n- Executive Dossier: {{ctoPdf_filename}}',
        imageUrl: '{{techFeedSnapshot}}',
        outputVariable: 'discordLog',
      },
    },
  },
  {
    id: 'tech_notify',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Desktop Briefing Alert',
      category: 'utility',
      type: 'show_notification',
      properties: {
        title: 'Technology Market Scan Complete',
        message: 'Generated CTO Dossier and Excel Matrix.',
        outputVariable: 'notifyResult',
      },
    },
  },
];

const techEdges: WorkflowEdge[] = [
  { id: 'e_tech_1', source: 'tech_nav', target: 'tech_scroll', animated: true },
  { id: 'e_tech_2', source: 'tech_scroll', target: 'tech_ext_titles', animated: true },
  { id: 'e_tech_3', source: 'tech_ext_titles', target: 'tech_ext_scores', animated: true },
  { id: 'e_tech_4', source: 'tech_ext_scores', target: 'tech_js_filter', animated: true },
  { id: 'e_tech_5', source: 'tech_js_filter', target: 'tech_ai_xlsx', animated: true },
  { id: 'e_tech_6', source: 'tech_ai_xlsx', target: 'tech_ai_pdf', animated: true },
  { id: 'e_tech_7', source: 'tech_ai_pdf', target: 'tech_snap', animated: true },
  { id: 'e_tech_8', source: 'tech_snap', target: 'tech_discord', animated: true },
  { id: 'e_tech_9', source: 'tech_discord', target: 'tech_notify', animated: true },
];

export const TECH_TALENT_ANALYZER_WORKFLOW: Workflow = {
  id: 'tpl_tech_talent_scanner',
  name: 'Tech Talent AI Scanner & Compensation Model',
  description: 'Automated developer intelligence and technology radar: Crawls trending engineering discussions, filters AI & architecture shifts, creates an Excel Matrix (.xlsx) and CTO Executive PDF Briefing, captures snapshot proof, and delivers real-time updates to Discord.',
  version: 2,
  createdAt: 1710000003000,
  updatedAt: 1710000003000,
  variables: {},
  settings: {
    timeout: 30000,
    retryCount: 1,
    retryDelay: 1000,
    stopOnError: true,
    highlightElements: true,
    humanMode: true,
    humanIntensity: 'fast',
    humanCursor: false,
  },
  nodes: autoLayoutNodes(techRawNodes, techEdges, { direction: 'TB', rankSep: 70, nodeSep: 70 }),
  edges: techEdges,
};
