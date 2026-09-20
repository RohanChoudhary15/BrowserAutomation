import { Workflow } from '../types/workflow';
import { ECOMMERCE_INTELLIGENCE_WORKFLOW } from './templates/ecommerce';
import { B2B_LEAD_ENRICHMENT_WORKFLOW } from './templates/b2bLeads';
import { TECH_TALENT_ANALYZER_WORKFLOW } from './templates/techTalent';
import { REAL_ESTATE_DEAL_FINDER_WORKFLOW } from './templates/realEstate';
import { BRAND_SENTIMENT_CRISIS_WORKFLOW } from './templates/brandSentiment';

export {
  ECOMMERCE_INTELLIGENCE_WORKFLOW,
  B2B_LEAD_ENRICHMENT_WORKFLOW,
  TECH_TALENT_ANALYZER_WORKFLOW,
  REAL_ESTATE_DEAL_FINDER_WORKFLOW,
  BRAND_SENTIMENT_CRISIS_WORKFLOW,
};

export const DEPRECATED_TEMPLATE_IDS: string[] = [
  'starter_example_automation',
  'hn_live_scraper',
  'quotes_live_scraper',
];

export const STARTER_WORKFLOW: Workflow = ECOMMERCE_INTELLIGENCE_WORKFLOW;

export const ALL_TEMPLATES: Workflow[] = [
  ECOMMERCE_INTELLIGENCE_WORKFLOW,
  B2B_LEAD_ENRICHMENT_WORKFLOW,
  TECH_TALENT_ANALYZER_WORKFLOW,
  REAL_ESTATE_DEAL_FINDER_WORKFLOW,
  BRAND_SENTIMENT_CRISIS_WORKFLOW,
];
