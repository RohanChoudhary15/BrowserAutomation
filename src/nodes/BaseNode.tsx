import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { NODE_REGISTRY, CATEGORIES } from './registry';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Play, CheckCircle2, AlertCircle, Loader2, Trash2, Clock } from 'lucide-react';

export interface CustomNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const BaseNode: React.FC<CustomNodeProps> = memo(({ id, data, selected }) => {
  const def = NODE_REGISTRY[data.type] || {
    label: data.label || 'Node',
    icon: 'Box',
    category: data.category || 'browser',
    description: '',
  };

  const category = CATEGORIES.find(c => c.id === data.category) || CATEGORIES[0];
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  // Summary of primary configuration
  let summary = '';
  if (data.type === 'smart_scroll') summary = `${data.properties?.mode || 'to_bottom'} • ${data.properties?.scrollSpeed || 'normal'} (${data.properties?.maxScrolls || 5} passes)`;
  else if (data.type === 'generate_image') {
    const asyncCount = Number(data.properties?.asyncCount || data.properties?.count || 1);
    const asyncStr = asyncCount > 1 ? ` • ${asyncCount}x async` : '';
    const imgStr = data.properties?.inputImage ? ' • img2img' : '';
    summary = `${data.properties?.model || 'dall-e-3'} • ${data.properties?.size || '1024x1024'}${asyncStr}${imgStr}`;
  }
  else if (data.type === 'firecrawl') summary = `${data.properties?.mode || 'scrape'}: ${data.properties?.url || '{{currentUrl}}'}`;
  else if (data.type === 'download_file') summary = data.properties?.filename || 'download.txt';
  else if (data.type === 'show_notification') summary = `"${data.properties?.title || 'Alert'}"`;
  else if (data.type === 'math_calculate') summary = `${data.properties?.outputVariable || 'counter'} (${data.properties?.operation || 'add'})`;
  else if (data.type === 'export_data') summary = `${(data.properties?.format || 'csv').toUpperCase()}: ${data.properties?.filename || 'dataset'}`;
  else if (data.type === 'stop_timer') summary = `Stop: ${data.properties?.targetTimer === 'all' ? 'All Timers' : data.properties?.targetTimer || 'All'} (${data.properties?.action === 'cancel' ? 'Cancel' : 'Finish Early'})`;
  else if (data.type === 'reset_timer') summary = `Reset: ${data.properties?.targetTimer === 'all' ? 'All Timers' : data.properties?.targetTimer || 'All'} (${data.properties?.mode === 'extend' ? `+${data.properties?.extendMs || 5000}ms` : 'Restart'})`;
  else if (data.type === 'stop_workflow') summary = `Exit Workflow (${data.properties?.exitStatus || 'completed'})`;
  else if (data.type === 'pause_workflow') summary = data.properties?.message ? `"${data.properties.message.slice(0, 26)}"` : 'Wait for Resume';
  else if (data.type === 'skip_to') summary = `Jump to: ${data.properties?.targetNodeId || 'Select node'}`;
  else if (data.type === 'youtube_scraper') summary = `YouTube: ${data.properties?.mode || 'search'} (${data.properties?.query || data.properties?.url || 'auto'})`;
  else if (data.type === 'instagram_scraper') summary = `Instagram: @${data.properties?.target || 'target'} (${data.properties?.mode || 'profile_posts'})`;
  else if (data.type === 'reddit_scraper') summary = `Reddit: ${data.properties?.mode === 'subreddit' ? `r/${data.properties?.subreddit}` : (data.properties?.query || 'search')}`;
  else if (data.type === 'linkedin_scraper') summary = `LinkedIn: ${data.properties?.keywords || 'Jobs'} in ${data.properties?.location || 'Remote'}`;
  else if (data.type === 'amazon_scraper') summary = `Amazon: "${data.properties?.query || 'items'}" (${data.properties?.domain || 'com'})`;
  else if (data.type === 'twitter_scraper') summary = `X/Twitter: ${data.properties?.query ? `"${data.properties?.query}"` : `@${data.properties?.username || 'user'}`}`;
  else if (data.type === 'google_search_scraper') summary = `Google Search: "${data.properties?.query || 'query'}"`;
  else if (data.type === 'get_page_info') summary = `Page Info -> {{${data.properties?.outputVariable || 'pageInfo'}}}`;
  else if (data.type === 'get_url_details') summary = `URL: ${data.properties?.sourceUrl || 'current'}${data.properties?.targetParam ? ` (${data.properties.targetParam})` : ''}`;
  else if (data.type === 'date_time') summary = `${data.properties?.mode || 'current_time'} (${data.properties?.format || 'iso'})`;
  else if (data.type === 'cookie_manager') summary = `${(data.properties?.action || 'get').toUpperCase()}: ${data.properties?.name || 'all'}`;
  else if (data.type === 'array_operation') summary = `${data.properties?.operation || 'deduplicate'}: ${data.properties?.array || '{{items}}'}`;
  else if (data.type === 'string_template') summary = `Template -> {{${data.properties?.outputVariable || 'renderedTemplate'}}}`;
  else if (data.type === 'json_query') summary = `${data.properties?.queryPath || 'query'}`;
  else if (data.type === 'while_loop') summary = `while (${data.properties?.leftValue || 'val'} ${data.properties?.operator || '=='} ${data.properties?.rightValue || ''})`;
  else if (data.type === 'retry_block') summary = `Retry up to ${data.properties?.maxRetries || 3}x (${data.properties?.backoffMode || 'exponential'})`;
  else if (data.type === 'rate_limiter') summary = `Throttle: ${data.properties?.mode || 'jitter'}`;
  else if (data.type === 'manual_approval') summary = `Prompt: "${(data.properties?.promptMessage || 'Approval required').slice(0, 24)}..."`;
  else if (data.type === 'wait') {
    const timerPrefix = data.properties?.timerName ? `[${data.properties.timerName}] ` : '';
    const unit = data.properties?.unit || 'ms';
    const durVal = data.properties?.duration ?? data.properties?.timeout ?? 1000;
    const durFormatted = typeof durVal === 'string' && durVal.startsWith('{{')
      ? durVal
      : unit === 's'
      ? `${durVal}s`
      : Number(durVal) >= 1000 && Number(durVal) % 1000 === 0
      ? `${Number(durVal) / 1000}s (${durVal}ms)`
      : `${durVal}ms`;
    if (data.properties?.stopCondition?.enabled) {
      const cond = data.properties.stopCondition;
      const condDesc = cond.type === 'text' ? `"${cond.text || 'text'}"` : (cond.type === 'element' ? (cond.selector || 'element') : 'condition');
      summary = `${timerPrefix}${durFormatted} or until ${condDesc}`;
    } else {
      summary = `${timerPrefix}${durFormatted}`;
    }
  }
  else if (data.properties?.url) summary = data.properties.url;
  else if (data.properties?.selector) summary = data.properties.selector;
  else if (data.properties?.text) summary = `"${data.properties.text}"`;
  else if (data.properties?.duration) summary = `${data.properties.duration}ms`;
  else if (data.properties?.name) summary = `name: ${data.properties.name}`;
  else if (data.properties?.leftValue) summary = `${data.properties.leftValue} ${data.properties.operator || '=='} ${data.properties.rightValue || ''}`;
  else if (data.properties?.code) summary = data.properties.code.slice(0, 30);
  else if (data.properties?.message) summary = `"${data.properties.message.slice(0, 28)}"`;
  else if (data.properties?.content) summary = `"${data.properties.content.slice(0, 28)}"`;

  // Status-specific border and glow
  let borderClass = 'border-[#232a3b] hover:border-[#3b82f6]/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-blue-500 ring-2 ring-blue-500/30';
    glowClass = 'shadow-[0_0_15px_rgba(59,130,246,0.5)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  } else if (selected) {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/50';
    glowClass = 'shadow-[0_0_12px_rgba(99,102,241,0.3)]';
  }

  return (
    <div
      className={`group relative min-w-[210px] max-w-[260px] rounded-xl bg-[#11141c] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Target Handle (Input) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-indigo-400 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
            style={{ backgroundColor: category.color }}
          >
            <Icon name={def.icon} className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || def.label}</div>
        </div>

        {/* Status Indicator & Quick Actions */}
        <div className="shrink-0 flex items-center gap-1">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {status === 'idle' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              title="Run this node"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-emerald-400 transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDeleteNode?.(id);
            }}
            title="Delete node (Del)"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Summary preview */}
      {summary && (
        <div className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-400 font-mono truncate border border-[#1c2230]">
          {summary}
        </div>
      )}

      {/* Wait Node Quick Duration Presets on Card */}
      {data.type === 'wait' && status !== 'running' && (
        <div className="mt-1.5 flex items-center gap-1">
          {[1, 2, 5, 10].map((sec) => {
            const unit = data.properties?.unit || 'ms';
            const dur = data.properties?.duration ?? data.properties?.timeout ?? 1000;
            const isMatch = unit === 's' ? Number(dur) === sec : Number(dur) === sec * 1000;
            return (
              <button
                key={sec}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent('autoflow:update-node-properties', {
                      detail: {
                        nodeId: id,
                        properties: {
                          ...data.properties,
                          duration: unit === 's' ? sec : sec * 1000,
                          timeout: unit === 's' ? sec : sec * 1000,
                        },
                      },
                    })
                  );
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
                  isMatch
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-[#141824] hover:bg-[#1f2638] text-gray-400 hover:text-white border border-[#202738]'
                }`}
                title={`Set wait time to ${sec}s`}
              >
                {sec}s
              </button>
            );
          })}
        </div>
      )}

      {/* Wait Node Live Countdown Widget */}
      {data.type === 'wait' && status === 'running' && (
        <div className="mt-2 p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 space-y-1.5 animate-pulse">
          <div className="flex items-center justify-between text-[11px] font-mono text-amber-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>
                {runtime?.dynamicState?.remainingSeconds !== undefined
                  ? `${runtime.dynamicState.remainingSeconds}s remaining`
                  : `${((data.properties?.duration || 1000) / 1000).toFixed(1)}s remaining`}
              </span>
            </span>
            <span className="text-[10px] text-amber-400/70">
              {runtime?.dynamicState?.totalSeconds ?? ((data.properties?.duration || 1000) / 1000).toFixed(1)}s total
            </span>
          </div>
          <div className="w-full bg-[#11141c] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-400 h-1.5 rounded-full transition-all duration-150"
              style={{ width: `${runtime?.dynamicState?.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Generic Dynamic Live State on Node */}
      {data.type !== 'wait' && status === 'running' && runtime?.dynamicState?.message && (
        <div className="mt-2 p-2 rounded-lg bg-blue-950/40 border border-blue-500/40 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-blue-200">
            <span className="flex items-center gap-1.5 truncate font-semibold">
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />
              <span className="truncate">{runtime.dynamicState.message}</span>
            </span>
            {runtime.dynamicState.progress !== undefined && (
              <span className="text-[10px] text-blue-400 font-bold shrink-0 ml-1">
                {runtime.dynamicState.progress}%
              </span>
            )}
          </div>
          {runtime.dynamicState.progress !== undefined && (
            <div className="w-full bg-[#11141c] rounded-full h-1 overflow-hidden">
              <div
                className="bg-blue-500 h-1 rounded-full transition-all duration-150"
                style={{ width: `${runtime.dynamicState.progress}%` }}
              />
            </div>
          )}
          {runtime.dynamicState.detail && (
            <div className="text-[9px] text-blue-300/80 font-mono truncate bg-[#11141c]/60 px-1 py-0.5 rounded">
              {runtime.dynamicState.detail}
            </div>
          )}
        </div>
      )}

      {/* Mini Screenshot/Image preview if present */}
      {runtime?.dynamicState?.previewUrl && status === 'success' && (
        <div className="mt-2 rounded-lg border border-[#1c2230] overflow-hidden bg-black/60 relative group/thumb">
          <img
            src={runtime.dynamicState.previewUrl}
            alt="Preview"
            className="w-full max-h-36 object-contain bg-black/80"
          />
          <div className="absolute bottom-0 inset-x-0 bg-black/75 px-1.5 py-0.5 text-[9px] text-emerald-300 font-mono flex items-center justify-between backdrop-blur-sm">
            <span>{data.type === 'generate_image' ? 'Generated image' : 'Captured image'}</span>
            {data.properties?.size && (
              <span className="text-[8px] text-gray-400">{data.properties.size}</span>
            )}
          </div>
        </div>
      )}

      {/* Execution timing / Error message badge */}
      {runtime?.durationMs !== undefined && status === 'success' && (
        <div className="mt-1.5 text-[10px] text-emerald-400/80 font-mono">
          ✓ {runtime.dynamicState?.message || `completed in ${runtime.durationMs}ms`}
        </div>
      )}

      {runtime?.error && status === 'error' && (
        <div className="mt-1.5 text-[10px] text-rose-400 font-mono truncate" title={runtime.error}>
          ! {runtime.error}
        </div>
      )}

      {/* Source Handle (Output) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-indigo-400 transition-colors"
      />
    </div>
  );
});
