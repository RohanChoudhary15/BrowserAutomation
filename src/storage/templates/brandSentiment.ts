import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/workflow';
import { autoLayoutNodes } from '../../utils/autoLayout';

const crisisRawNodes: WorkflowNode[] = [
  {
    id: 'pr_nav',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Open Community Feed',
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
    id: 'pr_scroll',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Smart Scroll Live Feed',
      category: 'interaction',
      type: 'smart_scroll',
      properties: {
        passes: 2,
        distance: 500,
        delayMs: 400,
        scrollMode: 'down',
      },
    },
  },
  {
    id: 'pr_ext_posts',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract User Commentary',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: '.titleline > a',
        outputVariable: 'communityPosts',
        timeout: 10000,
      },
    },
  },
  {
    id: 'pr_ext_authors',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Author Handles',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: '.subtext .hnuser',
        outputVariable: 'authorHandles',
        timeout: 10000,
      },
    },
  },
  {
    id: 'pr_js_package',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Format Audit Feed',
      category: 'utility',
      type: 'execute_javascript',
      properties: {
        code: `const posts = variables.communityPosts || [];
const authors = variables.authorHandles || [];
return posts.slice(0, 8).map((p, i) => ({
  postId: 'POST-' + (i + 1),
  author: String(authors[i] || 'user'),
  text: String(p)
}));`,
        outputVariable: 'feedbackBatch',
      },
    },
  },
  {
    id: 'pr_ai_nlp',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'NLP Sentiment Classification (JSON)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Analyze these public community discussions for brand sentiment and operational risk: {{feedbackBatch}}. Output JSON with: averageSentimentScore (-100 to 100), primaryPainPoints (array), and crisisFlag (boolean).',
        outputFormat: 'json',
        jsonMode: true,
        outputVariable: 'sentimentAudit',
      },
    },
  },
  {
    id: 'pr_cond_threat',
    type: 'conditionNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Threat Audit Present',
      category: 'logic',
      type: 'condition',
      properties: {
        leftValue: '{{sentimentAudit}}',
        operator: 'exists',
        rightValue: '',
      },
    },
  },
  {
    id: 'pr_snap',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Capture Evidence Proof',
      category: 'utility',
      type: 'screenshot',
      properties: {
        outputVariable: 'crisisEvidenceSnap',
      },
    },
  },
  {
    id: 'pr_ai_pdf_plan',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Generate PR Response Plan (.pdf)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Draft an Urgent Public Relations Action Plan based on this sentiment evaluation: {{sentimentAudit}}. Include holding statement, key messaging points, and leadership escalation steps.',
        outputFormat: 'pdf',
        downloadFilename: 'pr_crisis_action_plan',
        autoDownload: true,
        outputVariable: 'crisisPdf',
      },
    },
  },
  {
    id: 'pr_slack_war_room',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Alert Slack #war-room',
      category: 'messaging',
      type: 'slack_message',
      properties: {
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/WARROOM',
        messageType: 'blocks',
        channel: '#incident-response',
        message: '🚨 *URGENT: Brand Sentiment Audit Completed*\nPlan: {{crisisPdf_filename}}',
        outputVariable: 'slackWarRoomResult',
      },
    },
  },
  {
    id: 'pr_discord_ops',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Log Discord Ops Alert',
      category: 'messaging',
      type: 'discord_message',
      properties: {
        webhookUrl: 'https://discord.com/api/webhooks/OPS_LOG',
        messageType: 'embed',
        message: '⚠️ **Brand Sentiment Alert Logged**\nAction plan generated: {{crisisPdf_filename}}',
        imageUrl: '{{crisisEvidenceSnap}}',
        outputVariable: 'discordOpsResult',
      },
    },
  },
  {
    id: 'pr_telegram_exec',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Emergency Telegram Ping',
      category: 'messaging',
      type: 'telegram_message',
      properties: {
        chatId: '-100555666777',
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        messageType: 'text',
        message: '🚨 *PR Executive Briefing Ready*\nAction Plan: {{crisisPdf_filename}}',
        outputVariable: 'telegramExecResult',
      },
    },
  },
  {
    id: 'pr_notify',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Desktop Incident Notice',
      category: 'utility',
      type: 'show_notification',
      properties: {
        title: 'Brand Sentiment Scan Finalized',
        message: 'PR Response Plan generated and dispatched.',
        outputVariable: 'prNotifyResult',
      },
    },
  },
];

const crisisEdges: WorkflowEdge[] = [
  { id: 'e_pr_1', source: 'pr_nav', target: 'pr_scroll', animated: true },
  { id: 'e_pr_2', source: 'pr_scroll', target: 'pr_ext_posts', animated: true },
  { id: 'e_pr_3', source: 'pr_ext_posts', target: 'pr_ext_authors', animated: true },
  { id: 'e_pr_4', source: 'pr_ext_authors', target: 'pr_js_package', animated: true },
  { id: 'e_pr_5', source: 'pr_js_package', target: 'pr_ai_nlp', animated: true },
  { id: 'e_pr_6', source: 'pr_ai_nlp', target: 'pr_cond_threat', animated: true },
  { id: 'e_pr_7', source: 'pr_cond_threat', target: 'pr_snap', sourceHandle: 'true', label: 'TRUE', animated: true },
  { id: 'e_pr_8', source: 'pr_snap', target: 'pr_ai_pdf_plan', animated: true },
  { id: 'e_pr_9', source: 'pr_ai_pdf_plan', target: 'pr_slack_war_room', animated: true },
  { id: 'e_pr_10', source: 'pr_slack_war_room', target: 'pr_discord_ops', animated: true },
  { id: 'e_pr_11', source: 'pr_discord_ops', target: 'pr_telegram_exec', animated: true },
  { id: 'e_pr_12', source: 'pr_telegram_exec', target: 'pr_notify', animated: true },
];

export const BRAND_SENTIMENT_CRISIS_WORKFLOW: Workflow = {
  id: 'tpl_brand_sentiment_crisis',
  name: 'Social Media Sentiment & Crisis Alert Engine',
  description: 'Omnichannel brand reputation and PR crisis defense workflow: Gathers public comments with smart scroll, performs deep AI NLP sentiment classification in JSON mode, evaluates crisis flags, captures evidence screenshots, formats an emergency PR Response Plan in PDF, and alerts Slack, Discord, and Telegram simultaneously.',
  version: 2,
  createdAt: 1710000005000,
  updatedAt: 1710000005000,
  variables: {},
  settings: {
    timeout: 30000,
    retryCount: 1,
    retryDelay: 1000,
    stopOnError: true,
    highlightElements: true,
    humanMode: true,
    humanIntensity: 'natural',
    humanCursor: true,
  },
  nodes: autoLayoutNodes(crisisRawNodes, crisisEdges, { direction: 'TB', rankSep: 70, nodeSep: 70 }),
  edges: crisisEdges,
};
