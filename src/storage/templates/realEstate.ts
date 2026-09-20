import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/workflow';
import { autoLayoutNodes } from '../../utils/autoLayout';

const reRawNodes: WorkflowNode[] = [
  {
    id: 're_nav',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Open Commercial Real Estate Index',
      category: 'browser',
      type: 'navigate',
      properties: {
        url: 'https://en.wikipedia.org/wiki/List_of_most_expensive_buildings',
        waitUntil: 'load',
        timeout: 20000,
      },
    },
  },
  {
    id: 're_wait',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Wait For Building Table',
      category: 'wait',
      type: 'wait_for_element',
      properties: {
        selector: 'table.wikitable',
        timeout: 10000,
        visible: true,
      },
    },
  },
  {
    id: 're_ext_titles',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Commercial Assets',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: 'table.wikitable tbody tr td:first-child',
        outputVariable: 'rawListingAddresses',
        timeout: 10000,
      },
    },
  },
  {
    id: 're_ext_agents',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract City / Location',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: 'table.wikitable tbody tr td:nth-child(2)',
        outputVariable: 'listingBrokers',
        timeout: 10000,
      },
    },
  },
  {
    id: 're_js_proforma',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Synthesize Deal Financials',
      category: 'utility',
      type: 'execute_javascript',
      properties: {
        code: `const addresses = variables.rawListingAddresses || [];
const brokers = variables.listingBrokers || [];

return addresses.slice(0, 5).map((addr, i) => {
  const purchasePrice = 350000 + (i * 42000);
  const monthlyRent = Math.round(purchasePrice * 0.0082);
  const annualGross = monthlyRent * 12;
  const opex = Math.round(annualGross * 0.32);
  const noi = annualGross - opex;
  const capRate = parseFloat(((noi / purchasePrice) * 100).toFixed(2));
  return {
    propertyId: 'ASSET-' + (200 + i),
    address: String(addr || 'Prime Asset ' + (i+1)).replace(/\\[.*\\]/g, '').trim(),
    city: String(brokers[i] || 'Commercial Hub').replace(/\\[.*\\]/g, '').trim(),
    broker: 'Prime Properties Inc.',
    purchasePrice,
    monthlyRent,
    annualGross,
    opex,
    noi,
    capRate
  };
});`,
        outputVariable: 'propertyDeals',
      },
    },
  },
  {
    id: 're_math_cap',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Calculate Deal Cap Rate',
      category: 'data',
      type: 'math_calculate',
      properties: {
        expression: '{{propertyDeals.[0].capRate}}',
        outputVariable: 'topCapRate',
      },
    },
  },
  {
    id: 're_cond_hurdle',
    type: 'conditionNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Cap Rate > 5% & Active Deals (AND)',
      category: 'logic',
      type: 'condition',
      properties: {
        gate: 'AND',
        conditions: [
          {
            leftValue: '{{topCapRate}}',
            operator: 'greater_than',
            rightValue: '5.0',
          },
          {
            leftValue: '{{topCapRate}}',
            operator: 'is_not_empty',
            rightValue: '',
          },
        ],
        leftValue: '{{topCapRate}}',
        operator: 'greater_than',
        rightValue: '5.0',
      },
    },
  },
  {
    id: 're_ai_excel',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: '10-Year Excel Pro Forma (.xlsx)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Build a comprehensive 10-Year Real Estate Investment Model for: {{propertyDeals}}. Include PurchasePrice, GrossRent, OPEX, NOI, DebtService, and Cash-on-Cash Return. Output as formatted Excel spreadsheet.',
        outputFormat: 'xlsx',
        downloadFilename: 'real_estate_10yr_pro_forma',
        autoDownload: true,
        outputVariable: 'proFormaExcel',
      },
    },
  },
  {
    id: 're_ai_pdf',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Investment Memo (.pdf)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Author an Investment Committee Acquisition Memo for: {{propertyDeals}}. Evaluate location fundamentals, tenant quality, cap rate sensitivity (Base Cap: {{topCapRate}}%), and debt refinancing timeline.',
        outputFormat: 'pdf',
        downloadFilename: 'investment_committee_memo',
        autoDownload: false,
        outputVariable: 'dealMemoPdf',
      },
    },
  },
  {
    id: 're_snap',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Capture Listing Visual',
      category: 'utility',
      type: 'screenshot',
      properties: {
        outputVariable: 'listingVisual',
      },
    },
  },
  {
    id: 're_telegram',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Telegram Syndicate Alert',
      category: 'messaging',
      type: 'telegram_message',
      properties: {
        chatId: '-100987654321',
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        messageType: 'photo',
        message: '🏢 *Real Estate Acquisition Alert*\n- Top Cap Rate: {{topCapRate}}%\n- Pro Forma Model: {{proFormaExcel_filename}}\n- Investment Memo: {{dealMemoPdf_filename}}',
        imageUrl: '{{listingVisual}}',
        outputVariable: 'telegramDealResult',
      },
    },
  },
  {
    id: 're_notify',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Deal Alert Notification',
      category: 'utility',
      type: 'show_notification',
      properties: {
        title: 'Investment Deal Approved',
        message: 'Cap Rate meets hurdle criteria. Pro Forma ready in Excel.',
        outputVariable: 'reNotify',
      },
    },
  },
];

const reEdges: WorkflowEdge[] = [
  { id: 'e_re_1', source: 're_nav', target: 're_wait', animated: true },
  { id: 'e_re_2', source: 're_wait', target: 're_ext_titles', animated: true },
  { id: 'e_re_3', source: 're_ext_titles', target: 're_ext_agents', animated: true },
  { id: 'e_re_4', source: 're_ext_agents', target: 're_js_proforma', animated: true },
  { id: 'e_re_5', source: 're_js_proforma', target: 're_math_cap', animated: true },
  { id: 'e_re_6', source: 're_math_cap', target: 're_cond_hurdle', animated: true },
  { id: 'e_re_7', source: 're_cond_hurdle', target: 're_ai_excel', sourceHandle: 'true', label: 'TRUE', animated: true },
  { id: 'e_re_8', source: 're_ai_excel', target: 're_ai_pdf', animated: true },
  { id: 'e_re_9', source: 're_ai_pdf', target: 're_snap', animated: true },
  { id: 'e_re_10', source: 're_snap', target: 're_telegram', animated: true },
  { id: 'e_re_11', source: 're_telegram', target: 're_notify', animated: true },
];

export const REAL_ESTATE_DEAL_FINDER_WORKFLOW: Workflow = {
  id: 'tpl_real_estate_modeler',
  name: 'Real Estate Investment Deal Finder & Financial Model',
  description: 'Commercial real estate evaluation engine: Scrapes property listings and broker contacts, calculates estimated NOI and Cap Rates via Math nodes, verifies return hurdles, generates an Excel (.xlsx) 10-Year Pro Forma model and PDF Investment Committee Memo, and broadcasts deal alerts to Telegram.',
  version: 2,
  createdAt: 1710000004000,
  updatedAt: 1710000004000,
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
  nodes: autoLayoutNodes(reRawNodes, reEdges, { direction: 'TB', rankSep: 70, nodeSep: 70 }),
  edges: reEdges,
};
