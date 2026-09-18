export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export interface FriendlyError {
  title: string;
  message: string;
  selector?: string;
  timeoutMs?: number;
  suggestions: string[];
}

export function createFriendlyError(
  action: string,
  error: any,
  options?: { selector?: string; timeoutMs?: number; url?: string }
): FriendlyError {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const selector = options?.selector;
  const timeoutSec = options?.timeoutMs ? Math.round(options.timeoutMs / 1000) : undefined;

  if (rawMsg.toLowerCase().includes('not found') || rawMsg.toLowerCase().includes('timeout') || rawMsg.toLowerCase().includes('timed out')) {
    return {
      title: `${action} failed - Element not found`,
      message: selector
        ? `Could not find the element matching selector: "${selector}" within ${timeoutSec || 10} seconds.`
        : `Operation timed out waiting for DOM element.`,
      selector,
      timeoutMs: options?.timeoutMs,
      suggestions: [
        'The page may still be loading or rendering dynamically (try adding a Wait node).',
        'The selector may have changed on the target website.',
        'The element might be inside an iframe or Shadow DOM.',
        'Click "Select Element" in the properties panel to re-pick the target element directly from the page.',
      ],
    };
  }

  if (rawMsg.toLowerCase().includes('navigation') || rawMsg.toLowerCase().includes('net::err')) {
    return {
      title: `${action} failed - Navigation error`,
      message: `Failed to navigate to ${options?.url || 'target URL'}.`,
      suggestions: [
        'Check that the URL is valid and starts with http:// or https://',
        'Verify your internet connection and that the website is online.',
        'The website may be blocking automated access or requiring authentication.',
      ],
    };
  }

  if (rawMsg.toLowerCase().includes('aborted') || rawMsg.toLowerCase().includes('cancelled')) {
    return {
      title: `${action} stopped`,
      message: `Workflow execution was cancelled by user.`,
      suggestions: ['Execution was halted.'],
    };
  }

  return {
    title: `${action} failed`,
    message: rawMsg,
    selector,
    suggestions: [
      'Check the node configuration in the right properties panel.',
      'Test this individual node using "▶ Run Node" to isolate the issue.',
      'Check browser console for additional webpage errors.',
    ],
  };
}
