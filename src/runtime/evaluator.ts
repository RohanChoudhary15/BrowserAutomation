import { interpolateVariables } from './interpolator';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'does_not_contain'
  | 'greater_than'
  | 'less_than'
  | 'greater_equal'
  | 'less_equal'
  | 'exists'
  | 'does_not_exist'
  | 'is_empty'
  | 'is_not_empty'
  | 'regex_matches';

export type LogicalGate = 'AND' | 'OR' | 'NAND' | 'NOR';

export interface ConditionRule {
  leftValue: any;
  operator: ConditionOperator;
  rightValue?: any;
}

export interface ConditionItem extends ConditionRule {
  id?: string;
  gate?: LogicalGate;
}

/**
 * Parses numeric values safely (handles strings like "$25.50" or " 100px ")
 */
function parsePossibleNumber(val: any): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    if (cleaned.length > 0 && !isNaN(Number(cleaned))) {
      return Number(cleaned);
    }
  }
  return null;
}

/**
 * Checks if a value is conceptually empty (null, undefined, '', empty array, empty object)
 */
function isEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

/**
 * Evaluates a condition rule with given variable context
 */
export function evaluateCondition(
  rule: ConditionRule,
  variables: Record<string, any>
): boolean {
  const left = interpolateVariables(rule.leftValue, variables);
  const right = interpolateVariables(rule.rightValue, variables);

  switch (rule.operator) {
    case 'equals':
      return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();

    case 'not_equals':
      return String(left).trim().toLowerCase() !== String(right).trim().toLowerCase();

    case 'contains':
      return String(left).toLowerCase().includes(String(right).toLowerCase());

    case 'does_not_contain':
      return !String(left).toLowerCase().includes(String(right).toLowerCase());

    case 'greater_than': {
      const numL = parsePossibleNumber(left);
      const numR = parsePossibleNumber(right);
      if (numL !== null && numR !== null) return numL > numR;
      return String(left) > String(right);
    }

    case 'less_than': {
      const numL = parsePossibleNumber(left);
      const numR = parsePossibleNumber(right);
      if (numL !== null && numR !== null) return numL < numR;
      return String(left) < String(right);
    }

    case 'greater_equal': {
      const numL = parsePossibleNumber(left);
      const numR = parsePossibleNumber(right);
      if (numL !== null && numR !== null) return numL >= numR;
      return String(left) >= String(right);
    }

    case 'less_equal': {
      const numL = parsePossibleNumber(left);
      const numR = parsePossibleNumber(right);
      if (numL !== null && numR !== null) return numL <= numR;
      return String(left) <= String(right);
    }

    case 'exists':
      return left !== null && left !== undefined && left !== '';

    case 'does_not_exist':
      return left === null || left === undefined || left === '';

    case 'is_empty':
      return isEmpty(left);

    case 'is_not_empty':
      return !isEmpty(left);

    case 'regex_matches': {
      try {
        const regex = new RegExp(String(right), 'i');
        return regex.test(String(left));
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Evaluates multiple condition rules combined with AND, OR, NAND, or NOR logic
 */
export function evaluateCompoundCondition(
  conditions: ConditionItem[],
  logicalGate: LogicalGate = 'AND',
  variables: Record<string, any> = {}
): boolean {
  if (!conditions || conditions.length === 0) return true;

  const results = conditions.map((rule) => evaluateCondition(rule, variables));

  switch (logicalGate) {
    case 'AND':
      // True only if ALL rules are true
      return results.every(Boolean);

    case 'OR':
      // True if AT LEAST ONE rule is true
      return results.some(Boolean);

    case 'NAND':
      // Negated AND: True unless ALL are true (!all)
      return !results.every(Boolean);

    case 'NOR':
      // Negated OR: True ONLY if ALL are false (!any)
      return !results.some(Boolean);

    default:
      return results.every(Boolean);
  }
}
