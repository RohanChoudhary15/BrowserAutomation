import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateCompoundCondition } from '../src/runtime/evaluator';
import { safeEvaluateMath } from '../src/runtime/sandboxEvaluator';

describe('Condition Evaluator', () => {
  const vars = {
    price: 45,
    formattedPrice: '$45.00',
    title: 'Example Domain',
    status: 'ACTIVE',
    emptyList: [],
    filledList: [1, 2],
    nullVal: null,
  };

  it('evaluates equality and not-equals', () => {
    expect(evaluateCondition({ leftValue: '{{status}}', operator: 'equals', rightValue: 'active' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{status}}', operator: 'not_equals', rightValue: 'inactive' }, vars)).toBe(true);
  });

  it('evaluates contains and does_not_contain', () => {
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'contains', rightValue: 'example' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'does_not_contain', rightValue: 'Google' }, vars)).toBe(true);
  });

  it('evaluates starts_with and ends_with', () => {
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'starts_with', rightValue: 'Example' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'starts_with', rightValue: 'example' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'starts_with', rightValue: 'example', caseSensitive: true }, vars)).toBe(false);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'starts_with', rightValue: 'Domain' }, vars)).toBe(false);

    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'ends_with', rightValue: 'Domain' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'ends_with', rightValue: 'domain' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'ends_with', rightValue: 'domain', caseSensitive: true }, vars)).toBe(false);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'ends_with', rightValue: 'Example' }, vars)).toBe(false);
  });

  it('evaluates numeric comparisons and currency stripping', () => {
    expect(evaluateCondition({ leftValue: '{{price}}', operator: 'greater_than', rightValue: 40 }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{price}}', operator: 'less_than', rightValue: 100 }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{formattedPrice}}', operator: 'greater_equal', rightValue: 45 }, vars)).toBe(true);
  });

  it('evaluates existence and emptiness', () => {
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'exists' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{nullVal}}', operator: 'does_not_exist' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{emptyList}}', operator: 'is_empty' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{filledList}}', operator: 'is_not_empty' }, vars)).toBe(true);
  });

  it('evaluates regular expressions', () => {
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'regex_matches', rightValue: '^Example.*' }, vars)).toBe(true);
    expect(evaluateCondition({ leftValue: '{{title}}', operator: 'regex_matches', rightValue: '^[0-9]+$' }, vars)).toBe(false);
  });

  describe('Compound Condition Evaluation (AND, OR, NAND, NOR)', () => {
    const condTrue1 = { leftValue: '{{price}}', operator: 'greater_than' as const, rightValue: 40 };
    const condTrue2 = { leftValue: '{{status}}', operator: 'equals' as const, rightValue: 'ACTIVE' };
    const condFalse = { leftValue: '{{price}}', operator: 'less_than' as const, rightValue: 10 };

    it('evaluates AND gate correctly', () => {
      expect(evaluateCompoundCondition([condTrue1, condTrue2], 'AND', vars)).toBe(true);
      expect(evaluateCompoundCondition([condTrue1, condFalse], 'AND', vars)).toBe(false);
      expect(evaluateCompoundCondition([condFalse, condFalse], 'AND', vars)).toBe(false);
    });

    it('evaluates OR gate correctly', () => {
      expect(evaluateCompoundCondition([condTrue1, condFalse], 'OR', vars)).toBe(true);
      expect(evaluateCompoundCondition([condFalse, condFalse], 'OR', vars)).toBe(false);
      expect(evaluateCompoundCondition([condTrue1, condTrue2], 'OR', vars)).toBe(true);
    });

    it('evaluates NAND gate correctly (NOT AND)', () => {
      // True & True -> AND is true -> NAND is false
      expect(evaluateCompoundCondition([condTrue1, condTrue2], 'NAND', vars)).toBe(false);
      // True & False -> AND is false -> NAND is true
      expect(evaluateCompoundCondition([condTrue1, condFalse], 'NAND', vars)).toBe(true);
      // False & False -> AND is false -> NAND is true
      expect(evaluateCompoundCondition([condFalse, condFalse], 'NAND', vars)).toBe(true);
    });

    it('evaluates NOR gate correctly (NOT OR)', () => {
      // False & False -> OR is false -> NOR is true
      expect(evaluateCompoundCondition([condFalse, condFalse], 'NOR', vars)).toBe(true);
      // True & False -> OR is true -> NOR is false
      expect(evaluateCompoundCondition([condTrue1, condFalse], 'NOR', vars)).toBe(false);
      // True & True -> OR is true -> NOR is false
      expect(evaluateCompoundCondition([condTrue1, condTrue2], 'NOR', vars)).toBe(false);
    });

    it('handles empty conditions list safely', () => {
      expect(evaluateCompoundCondition([], 'AND', vars)).toBe(true);
      expect(evaluateCompoundCondition([], 'OR', vars)).toBe(true);
    });
  });

  describe('Safe Math Calculation', () => {
    it('evaluates basic arithmetic expressions safely', () => {
      expect(safeEvaluateMath('10 + 20', {})).toBe(30);
      expect(safeEvaluateMath('50 - 15', {})).toBe(35);
      expect(safeEvaluateMath('6 * 7', {})).toBe(42);
      expect(safeEvaluateMath('100 / 4', {})).toBe(25);
    });

    it('evaluates expressions with variables and interpolation', () => {
      expect(safeEvaluateMath('{{price}} * 2', vars)).toBe(90);
      expect(safeEvaluateMath('{{price}} + 5', vars)).toBe(50);
    });

    it('evaluates property access like array length', () => {
      expect(safeEvaluateMath('{{filledList}}.length', vars)).toBe(2);
      expect(safeEvaluateMath('{{emptyList}}.length', vars)).toBe(0);
    });
  });
});
