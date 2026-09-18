const SENSITIVE_KEY_PATTERNS = [
  /passw(or)?d/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /credit[_-]?card/i,
  /cvv/i,
  /ssn/i,
  /private[_-]?key/i,
];

/**
 * Redacts sensitive fields in objects and text before logging or storing
 */
export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Redact password assignment in URLs or strings if matching key=val
    let result = data;
    for (const pattern of SENSITIVE_KEY_PATTERNS) {
      const regex = new RegExp(`(${pattern.source}\\s*[:=]\\s*)(['"][^'"]*['"]|[^\\s&]+)`, 'gi');
      result = result.replace(regex, '$1********');
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some(p => p.test(key));
      if (isSensitive) {
        sanitized[key] = '********';
      } else {
        sanitized[key] = redactSensitiveData(val);
      }
    }
    return sanitized;
  }

  return data;
}
