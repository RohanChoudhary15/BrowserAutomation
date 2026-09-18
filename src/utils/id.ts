/**
 * Generate a short unique ID for nodes, edges, logs, and workflows
 */
export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 9);
  const time = Date.now().toString(36).substring(4);
  return `${prefix}_${time}${rand}`;
}
