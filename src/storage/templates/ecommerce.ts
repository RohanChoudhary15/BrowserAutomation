import { Workflow, WorkflowNode, WorkflowEdge } from '../../types/workflow';
import { autoLayoutNodes } from '../../utils/autoLayout';

const ecommerceRawNodes: WorkflowNode[] = [
  {
    id: 'eco_nav',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Open E-Commerce Store',
      category: 'browser',
      type: 'navigate',
      properties: {
        url: 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
        waitUntil: 'load',
        timeout: 20000,
      },
    },
  },
  {
    id: 'eco_scroll',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Smart Scroll Catalog',
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
    id: 'eco_wait_grid',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Wait For Products',
      category: 'wait',
      type: 'wait_for_element',
      properties: {
        selector: 'article.product_pod',
        timeout: 10000,
        visible: true,
      },
    },
  },
  {
    id: 'eco_extract_titles',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Product Titles',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: 'article.product_pod h3 a',
        outputVariable: 'productTitles',
        timeout: 10000,
      },
    },
  },
  {
    id: 'eco_extract_prices',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Product Prices',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: 'article.product_pod .price_color',
        outputVariable: 'productPrices',
        timeout: 10000,
      },
    },
  },
  {
    id: 'eco_extract_stocks',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Stock Status',
      category: 'extraction',
      type: 'extract_multiple',
      properties: {
        selector: 'article.product_pod .availability',
        outputVariable: 'stockStatuses',
        timeout: 10000,
      },
    },
  },
  {
    id: 'eco_extract_images',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Extract Product Covers',
      category: 'extraction',
      type: 'extract_all_images',
      properties: {
        outputVariable: 'productImages',
        minWidth: 50,
        minHeight: 50,
      },
    },
  },
  {
    id: 'eco_normalize_js',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Structure Product Dataset',
      category: 'utility',
      type: 'execute_javascript',
      properties: {
        code: `const titles = variables.productTitles || [];
const prices = variables.productPrices || [];
const stocks = variables.stockStatuses || [];
const images = variables.productImages || [];

return titles.map((title, i) => {
  const rawPrice = String(prices[i] || '0').replace(/[^0-9.]/g, '');
  const numericPrice = parseFloat(rawPrice) || 0;
  return {
    rank: i + 1,
    title: String(title).trim(),
    priceGbp: numericPrice,
    inStock: String(stocks[i] || '').toLowerCase().includes('in stock'),
    tier: numericPrice >= 40 ? 'Premium' : numericPrice >= 20 ? 'Mid-Range' : 'Budget',
    thumbnail: images[i] || ''
  };
});`,
        outputVariable: 'catalogDataset',
      },
    },
  },
  {
    id: 'eco_calc_count',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Compute Catalog Metrics',
      category: 'data',
      type: 'math_calculate',
      properties: {
        expression: '{{catalogDataset}}.length',
        outputVariable: 'itemCount',
      },
    },
  },
  {
    id: 'eco_cond_valid',
    type: 'conditionNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Products > 0 & Non-Empty (AND)',
      category: 'logic',
      type: 'condition',
      properties: {
        gate: 'AND',
        conditions: [
          {
            leftValue: '{{itemCount}}',
            operator: 'greater_than',
            rightValue: '0',
          },
          {
            leftValue: '{{catalogDataset}}',
            operator: 'is_not_empty',
            rightValue: '',
          },
        ],
        leftValue: '{{itemCount}}',
        operator: 'greater_than',
        rightValue: '0',
      },
    },
  },
  {
    id: 'eco_ai_excel',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Generate Excel Inventory (.xlsx)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Analyze this e-commerce catalog dataset: {{catalogDataset}}. Generate a clean inventory modeling table classifying each product by pricing tier, margin potential, and stock risk. Return as structured records.',
        outputFormat: 'xlsx',
        downloadFilename: 'ecommerce_inventory_model',
        autoDownload: true,
        outputVariable: 'inventoryExcel',
      },
    },
  },
  {
    id: 'eco_ai_pdf',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Generate Executive Briefing (.pdf)',
      category: 'utility',
      type: 'ai_agent',
      properties: {
        prompt: 'Draft an Executive Market Intelligence Briefing based on: {{catalogDataset}}. Summarize the total catalog valuation, price dispersion, competitive tier ratios, and actionable procurement recommendations.',
        outputFormat: 'pdf',
        downloadFilename: 'executive_market_briefing',
        autoDownload: false,
        outputVariable: 'executivePdf',
      },
    },
  },
  {
    id: 'eco_screenshot',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Capture Catalog Snapshot',
      category: 'utility',
      type: 'screenshot',
      properties: {
        outputVariable: 'catalogSnapshot',
      },
    },
  },
  {
    id: 'eco_discord_alert',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Dispatch Discord Alert',
      category: 'messaging',
      type: 'discord_message',
      properties: {
        webhookUrl: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_URL',
        messageType: 'embed',
        message: '📊 **E-Commerce Market Analysis Generated**\n- Cataloged Items: {{itemCount}}\n- Excel Model: {{inventoryExcel_filename}}\n- PDF Brief: {{executivePdf_filename}}\n- Status: In-stock verification complete.',
        imageUrl: '{{catalogSnapshot}}',
        outputVariable: 'discordResult',
      },
    },
  },
  {
    id: 'eco_desktop_notify',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Desktop Completion Alert',
      category: 'utility',
      type: 'show_notification',
      properties: {
        title: 'E-Commerce Intelligence Finished',
        message: 'Processed {{itemCount}} catalog items. Excel and PDF generated.',
        outputVariable: 'desktopNotification',
      },
    },
  },
];

const ecommerceEdges: WorkflowEdge[] = [
  { id: 'e_eco_1', source: 'eco_nav', target: 'eco_scroll', animated: true },
  { id: 'e_eco_2', source: 'eco_scroll', target: 'eco_wait_grid', animated: true },
  { id: 'e_eco_3', source: 'eco_wait_grid', target: 'eco_extract_titles', animated: true },
  { id: 'e_eco_4', source: 'eco_extract_titles', target: 'eco_extract_prices', animated: true },
  { id: 'e_eco_5', source: 'eco_extract_prices', target: 'eco_extract_stocks', animated: true },
  { id: 'e_eco_6', source: 'eco_extract_stocks', target: 'eco_extract_images', animated: true },
  { id: 'e_eco_7', source: 'eco_extract_images', target: 'eco_normalize_js', animated: true },
  { id: 'e_eco_8', source: 'eco_normalize_js', target: 'eco_calc_count', animated: true },
  { id: 'e_eco_9', source: 'eco_calc_count', target: 'eco_cond_valid', animated: true },
  { id: 'e_eco_10', source: 'eco_cond_valid', target: 'eco_ai_excel', sourceHandle: 'true', label: 'TRUE', animated: true },
  { id: 'e_eco_11', source: 'eco_ai_excel', target: 'eco_ai_pdf', animated: true },
  { id: 'e_eco_12', source: 'eco_ai_pdf', target: 'eco_screenshot', animated: true },
  { id: 'e_eco_13', source: 'eco_screenshot', target: 'eco_discord_alert', animated: true },
  { id: 'e_eco_14', source: 'eco_discord_alert', target: 'eco_desktop_notify', animated: true },
];

export const ECOMMERCE_INTELLIGENCE_WORKFLOW: Workflow = {
  id: 'tpl_ecommerce_intel',
  name: 'E-Commerce Price Intelligence & AI Executive Report',
  description: 'Full-cycle competitor intelligence pipeline: Smoothly scrolls online store with smart scroll, extracts product names, prices, stock flags, and covers, normalizes catalog data via JavaScript, computes price metrics, generates an Excel (.xlsx) model and Executive PDF report via AI Agent, and notifies Discord and desktop.',
  version: 2,
  createdAt: 1710000001000,
  updatedAt: 1710000001000,
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
  nodes: autoLayoutNodes(ecommerceRawNodes, ecommerceEdges, { direction: 'TB', rankSep: 70, nodeSep: 70 }),
  edges: ecommerceEdges,
};
