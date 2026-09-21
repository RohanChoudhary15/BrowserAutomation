/**
 * Safely resolves a dot-notation and array-indexed path from an object
 * e.g., 'user.profile.name' or 'items[0].price'
 */
export function getNestedValue(obj: any, path: string): any {
  if (obj === null || obj === undefined) return undefined;
  if (!path || path.trim() === '') return obj;

  // If the object directly contains the key (e.g. obj["currentProduct.title"]), return it directly
  if (typeof obj === 'object' && path in obj && obj[path] !== undefined) {
    return obj[path];
  }

  // Normalize array syntax: items[0].name -> items.0.name
  const normalizedPath = path
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[['"](.*?)['"]\]/g, '.$1');

  const parts = normalizedPath.split('.').filter(p => p.length > 0);
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Extracts variable names referenced in {{varName}} templates
 */
export function extractVariableNames(template: string): string[] {
  if (typeof template !== 'string') return [];
  const matches = template.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.slice(2, -2).trim())));
}

/**
 * Interpolates variables within a string, object, or array
 */
export function interpolateVariables(template: any, variables: Record<string, any>): any {
  if (template === null || template === undefined) return template;

  if (typeof template === 'string') {
    // If the template is ONLY a single variable expression: "{{item}}"
    const exactMatch = template.trim().match(/^\{\{([^}]+)\}\}$/);
    if (exactMatch) {
      const varPath = exactMatch[1].trim();
      const val = getNestedValue(variables, varPath);
      return val !== undefined ? val : '';
    }

    // Replace all occurrences inside a larger string: "Hello {{name}}!"
    return template.replace(/\{\{([^}]+)\}\}/g, (_, varPath) => {
      const val = getNestedValue(variables, varPath.trim());
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
  }

  if (Array.isArray(template)) {
    return template.map(item => interpolateVariables(item, variables));
  }

  if (typeof template === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = interpolateVariables(value, variables);
    }
    return result;
  }

  return template;
}
