import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '../src/runtime/evaluator';

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
});
