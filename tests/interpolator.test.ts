import { describe, it, expect } from 'vitest';
import { interpolateVariables, getNestedValue, extractVariableNames } from '../src/runtime/interpolator';

describe('Variable Interpolator', () => {
  it('resolves direct variable', () => {
    const vars = { username: 'alice' };
    expect(interpolateVariables('{{username}}', vars)).toBe('alice');
  });

  it('preserves native types for single variable replacement', () => {
    const vars = { count: 42, active: true, items: [1, 2, 3] };
    expect(interpolateVariables('{{count}}', vars)).toBe(42);
    expect(interpolateVariables('{{active}}', vars)).toBe(true);
    expect(interpolateVariables('{{items}}', vars)).toEqual([1, 2, 3]);
  });

  it('resolves nested object properties', () => {
    const vars = {
      user: {
        profile: {
          email: 'test@example.com',
        },
      },
    };
    expect(interpolateVariables('{{user.profile.email}}', vars)).toBe('test@example.com');
  });

  it('resolves array indexing', () => {
    const vars = {
      products: [
        { name: 'Widget A', price: 25 },
        { name: 'Widget B', price: 40 },
      ],
    };
    expect(interpolateVariables('{{products[0].name}}', vars)).toBe('Widget A');
    expect(interpolateVariables('{{products[1].price}}', vars)).toBe(40);
  });

  it('interpolates within string templates', () => {
    const vars = { host: 'api.example.com', id: 99 };
    const template = 'https://{{host}}/items/{{id}}';
    expect(interpolateVariables(template, vars)).toBe('https://api.example.com/items/99');
  });

  it('recursively interpolates objects and arrays', () => {
    const vars = { role: 'admin', port: 8080 };
    const obj = {
      userRole: '{{role}}',
      server: 'localhost:{{port}}',
      tags: ['tag-{{role}}'],
    };
    const res = interpolateVariables(obj, vars);
    expect(res).toEqual({
      userRole: 'admin',
      server: 'localhost:8080',
      tags: ['tag-admin'],
    });
  });

  it('extracts variable names accurately', () => {
    const template = 'Hello {{first_name}} {{last_name}}, your code is {{code}}';
    expect(extractVariableNames(template)).toEqual(['first_name', 'last_name', 'code']);
  });
});
