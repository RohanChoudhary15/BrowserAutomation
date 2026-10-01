import React from 'react';
import { WorkflowNode } from '../../../types/workflow';
import { NodeRuntimeState } from '../../../types/execution';
import {
  PlaySquare,
  Camera,
  Flame,
  Briefcase,
  ShoppingCart,
  AtSign,
  Search,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { TableExportSection } from './TableExportSection';

export interface ScraperPropertiesPanelProps {
  selectedNode: WorkflowNode;
  runtimeState?: NodeRuntimeState;
  onPropChange: (key: string, value: any) => void;
}

export const ScraperPropertiesPanel: React.FC<ScraperPropertiesPanelProps> = ({
  selectedNode,
  runtimeState,
  onPropChange,
}) => {
  const props = selectedNode.data.properties || {};
  const nodeType = selectedNode.data.type;

  const SCRAPER_TYPES = [
    'youtube_scraper',
    'instagram_scraper',
    'reddit_scraper',
    'linkedin_scraper',
    'amazon_scraper',
    'twitter_scraper',
    'google_search_scraper',
  ];

  if (!SCRAPER_TYPES.includes(nodeType)) {
    return null;
  }

  // Derive items for table export preview
  const items = Array.isArray(runtimeState?.output)
    ? runtimeState.output
    : (runtimeState?.output?.items && Array.isArray(runtimeState.output.items) ? runtimeState.output.items : []);

  const renderExecutionConfig = (accentClass = 'text-orange-500', currentEngine = props.engine || 'browser') => {
    if (currentEngine !== 'browser') {
      return (
        <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium">Direct Keyless Engine</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/40 font-semibold">
            Zero Tabs Opened ⚡
          </span>
        </div>
      );
    }

    return (
      <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-200 select-none">
            <input
              type="checkbox"
              checked={!!props.headless}
              onChange={(e) => onPropChange('headless', e.target.checked)}
              className={`rounded border-[#232a3b] bg-[#161a24] ${accentClass} focus:ring-0 w-3.5 h-3.5`}
            />
            <span className="font-medium">Headless Mode</span>
          </label>
          <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/30">
            Background Tab
          </span>
        </div>
        <p className="text-[10px] text-gray-500 leading-tight">
          Launches extraction in a dedicated background tab without stealing window focus.
        </p>

        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none pt-1 border-t border-[#1c2230]">
          <input
            type="checkbox"
            checked={props.autoCloseTab !== false}
            onChange={(e) => onPropChange('autoCloseTab', e.target.checked)}
            className={`rounded border-[#232a3b] bg-[#161a24] ${accentClass} focus:ring-0 w-3.5 h-3.5`}
          />
          <span className="text-[11px] text-gray-400">Auto-close tab when extraction finishes</span>
        </label>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. YOUTUBE SCRAPER */}
      {nodeType === 'youtube_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-500/30 flex items-center justify-between text-xs text-red-300">
            <span className="flex items-center gap-1.5 font-medium">
              <PlaySquare className="w-4 h-4 text-red-400" />
              <span>YouTube Scraper & Media Engine</span>
            </span>
            <span className="text-[10px] font-mono bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">Free & Keyless</span>
          </div>

          {/* Engine Selector: Browser DOM vs youtubei.js Engine */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Extraction Engine</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('engine', 'browser')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  (props.engine || 'browser') === 'browser'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🌐 Browser (DOM)</span>
              </button>
              <button
                type="button"
                onClick={() => onPropChange('engine', 'youtubei_js')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  props.engine === 'youtubei_js'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Uses youtubei.js Innertube engine: Zero tabs opened, fast direct transcripts, search, video info & comments"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>⚡ youtubei.js</span>
              </button>
            </div>
            {props.engine === 'youtubei_js' ? (
              <div className="space-y-1.5 mt-1.5">
                <p className="text-[10px] text-red-400/90 leading-tight">
                  ⚡ youtubei.js engine: runs keyless with 0 tabs opened! Supports transcripts, search, video details, and comments directly via YouTube&apos;s InnerTube API.
                </p>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none pt-1 border-t border-[#1c2230]">
                  <input
                    type="checkbox"
                    checked={!!props.browserFallback}
                    onChange={(e) => onPropChange('browserFallback', e.target.checked)}
                    className="rounded border-[#232a3b] bg-[#161a24] text-red-500 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span className="text-[11px] text-gray-300">Allow browser tab fallback if API is rate-limited (429)</span>
                </label>
                <p className="text-[9px] text-gray-500 leading-tight">
                  When unchecked (recommended/default), youtubei.js is strictly zero-tab and will never open a browser tab. If checked, it opens a temporary background tab to extract from the player DOM only if YouTube&apos;s timedtext API blocks the request.
                </p>
              </div>
            ) : null}
          </div>

          {renderExecutionConfig('text-red-500', props.engine || 'browser')}

          {/* Mode Switcher */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrape Mode</label>
            <div className="grid grid-cols-4 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              {[
                { id: 'search', label: 'Search' },
                { id: 'video_details', label: 'Details' },
                { id: 'video_script', label: 'Script 📜' },
                { id: 'comments', label: 'Comments' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPropChange('mode', m.id)}
                  className={`py-1 text-[11px] font-medium rounded transition-colors ${
                    (props.mode || 'search') === m.id
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Mode Inputs */}
          {(props.mode || 'search') === 'search' && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Search Query</label>
                <input
                  type="text"
                  value={props.query || ''}
                  onChange={(e) => onPropChange('query', e.target.value)}
                  placeholder="e.g. artificial intelligence tutorial"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Sort By</label>
                <select
                  value={props.sortBy || 'relevance'}
                  onChange={(e) => onPropChange('sortBy', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
                >
                  <option value="relevance">Relevance</option>
                  <option value="upload_date">Upload Date</option>
                  <option value="view_count">View Count</option>
                  <option value="rating">Rating</option>
                </select>
              </div>
            </>
          )}

          {/* Video Script (Transcript) Mode Inputs */}
          {props.mode === 'video_script' && (
            <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-500/30 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
                <FileCode className="w-4 h-4 text-red-400" />
                <span>Video Script & Transcript Extraction</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-tight">
                Extracts complete timestamped captions/subtitles and full spoken script text from any YouTube video.
              </p>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Video URL, Video ID, or Search Query</label>
                <input
                  type="text"
                  value={props.url || props.query || ''}
                  onChange={(e) => {
                    onPropChange('url', e.target.value);
                    onPropChange('query', e.target.value);
                  }}
                  placeholder="https://www.youtube.com/watch?v=... or dQw4w9WgXcQ or active tab"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Language</label>
                  <select
                    value={props.scriptLanguage || 'en'}
                    onChange={(e) => onPropChange('scriptLanguage', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
                  >
                    <option value="en">English (en)</option>
                    <option value="auto">Auto-detect</option>
                    <option value="es">Spanish (es)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                    <option value="hi">Hindi (hi)</option>
                    <option value="ja">Japanese (ja)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Format</label>
                  <select
                    value={props.scriptFormat || 'timestamped'}
                    onChange={(e) => onPropChange('scriptFormat', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
                  >
                    <option value="timestamped">Timestamped Rows</option>
                    <option value="full_text">Full Script Text</option>
                    <option value="all">Both (Table & String)</option>
                  </select>
                </div>
              </div>

              <div className="text-[10px] text-gray-400 bg-[#11141c] p-2 rounded border border-[#1c2230] space-y-0.5 font-mono">
                <div>&bull; Rows: <code>{`{{${props.outputVariable || 'youtubeResults'}}}`}</code></div>
                <div>&bull; Full Text: <code>{`{{${props.outputVariable || 'youtubeResults'}_script}}`}</code></div>
              </div>
            </div>
          )}

          {/* Details / Comments URL Input */}
          {(props.mode === 'video_details' || props.mode === 'comments') && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Video URL (Optional)</label>
              <input
                type="text"
                value={props.url || ''}
                onChange={(e) => onPropChange('url', e.target.value)}
                placeholder="Leave blank to use currently open watch tab"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
              />
            </div>
          )}

          {/* Limits & Auto-scroll */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Results</label>
              <input
                type="number"
                value={props.maxResults || 15}
                onChange={(e) => onPropChange('maxResults', Number(e.target.value))}
                min={1}
                max={100}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Scroll Passes</label>
              <input
                type="number"
                value={props.autoScrollPasses ?? 3}
                onChange={(e) => onPropChange('autoScrollPasses', Number(e.target.value))}
                min={0}
                max={20}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none text-xs"
              />
            </div>
          </div>

          {/* Variables */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'youtubeResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'video'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-red-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          {/* Table Output & Export Section */}
          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'youtubeResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="red"
          />
        </div>
      )}

      {/* 2. INSTAGRAM SCRAPER */}
      {nodeType === 'instagram_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-pink-950/20 border border-pink-500/30 flex items-center justify-between text-xs text-pink-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Camera className="w-4 h-4 text-pink-400" />
              <span>Instagram Public Scraper (Free)</span>
            </span>
            <span className="text-[10px] font-mono bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded">No Key Needed</span>
          </div>

          {renderExecutionConfig('text-pink-500')}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrape Mode</label>
            <div className="grid grid-cols-3 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              {[
                { id: 'profile_posts', label: 'Posts Grid' },
                { id: 'hashtag_posts', label: 'Hashtag' },
                { id: 'profile_info', label: 'Profile Bio' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPropChange('mode', m.id)}
                  className={`py-1 text-[11px] font-medium rounded transition-colors ${
                    (props.mode || 'profile_posts') === m.id
                      ? 'bg-pink-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              {(props.mode || 'profile_posts') === 'hashtag_posts' ? 'Hashtag (#)' : 'Target Profile / Username'}
            </label>
            <input
              type="text"
              value={props.target || ''}
              onChange={(e) => onPropChange('target', e.target.value)}
              placeholder={(props.mode || 'profile_posts') === 'hashtag_posts' ? 'e.g. photography' : 'e.g. nature'}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Results</label>
              <input
                type="number"
                value={props.maxResults || 12}
                onChange={(e) => onPropChange('maxResults', Number(e.target.value))}
                min={1}
                max={50}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Scroll Passes</label>
              <input
                type="number"
                value={props.autoScrollPasses ?? 3}
                onChange={(e) => onPropChange('autoScrollPasses', Number(e.target.value))}
                min={0}
                max={15}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'instagramResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'post'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'instagramResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="pink"
          />
        </div>
      )}

      {/* 3. REDDIT SCRAPER */}
      {nodeType === 'reddit_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-orange-950/20 border border-orange-500/30 flex items-center justify-between text-xs text-orange-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Reddit Scraper (Free & Keyless)</span>
            </span>
            <span className="text-[10px] font-mono bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded">snoowrap/API</span>
          </div>

          {/* Engine: snoowrap_api vs browser DOM */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Extraction Engine</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('engine', 'snoowrap_api')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                  (props.engine || 'snoowrap_api') === 'snoowrap_api'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Uses Reddit's authentic public JSON interface (zero tabs opened, instant, high-fidelity)"
              >
                <span>⚡ snoowrap (API)</span>
              </button>
              <button
                type="button"
                onClick={() => onPropChange('engine', 'browser')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                  props.engine === 'browser'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🌐 Browser (DOM)</span>
              </button>
            </div>
            {(props.engine || 'snoowrap_api') === 'snoowrap_api' ? (
              <p className="text-[10px] text-orange-400/90 mt-1">
                ⚡ snoowrap API: zero-tab direct JSON fetch. Extracts hot/new/top posts and comments with 0 tabs opened!
              </p>
            ) : null}
          </div>

          {renderExecutionConfig('text-orange-500', props.engine || 'snoowrap_api')}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrape Mode</label>
            <div className="grid grid-cols-3 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              {[
                { id: 'subreddit', label: 'Subreddit' },
                { id: 'search', label: 'Search' },
                { id: 'post_comments', label: 'Comments' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPropChange('mode', m.id)}
                  className={`py-1 text-[11px] font-medium rounded transition-colors ${
                    (props.mode || 'subreddit') === m.id
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {(props.mode || 'subreddit') === 'subreddit' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Subreddit Name (r/)</label>
              <input
                type="text"
                value={props.subreddit || ''}
                onChange={(e) => onPropChange('subreddit', e.target.value.replace(/^r\//, ''))}
                placeholder="e.g. webscraping or programming"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs"
              />
            </div>
          )}

          {props.mode === 'search' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Search Query</label>
              <input
                type="text"
                value={props.query || ''}
                onChange={(e) => onPropChange('query', e.target.value)}
                placeholder="e.g. browser automation"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Sort By</label>
              <select
                value={props.sortBy || 'hot'}
                onChange={(e) => onPropChange('sortBy', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs"
              >
                <option value="hot">Hot</option>
                <option value="new">New</option>
                <option value="top">Top</option>
                <option value="rising">Rising</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Results</label>
              <input
                type="number"
                value={props.maxResults || 25}
                onChange={(e) => onPropChange('maxResults', Number(e.target.value))}
                min={1}
                max={100}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'redditResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'post'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'redditResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="orange"
          />
        </div>
      )}

      {/* 4. LINKEDIN SCRAPER */}
      {nodeType === 'linkedin_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/30 flex items-center justify-between text-xs text-sky-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Briefcase className="w-4 h-4 text-sky-400" />
              <span>LinkedIn Scraper (Zero Auth)</span>
            </span>
            <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">No Key Needed</span>
          </div>

          {renderExecutionConfig('text-sky-500')}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrape Mode</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('mode', 'jobs_search')}
                className={`py-1 text-[11px] font-medium rounded transition-colors ${
                  (props.mode || 'jobs_search') === 'jobs_search'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Jobs Search
              </button>
              <button
                type="button"
                onClick={() => onPropChange('mode', 'job_detail')}
                className={`py-1 text-[11px] font-medium rounded transition-colors ${
                  props.mode === 'job_detail'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Job Detail
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Keywords</label>
              <input
                type="text"
                value={props.keywords || ''}
                onChange={(e) => onPropChange('keywords', e.target.value)}
                placeholder="Frontend Developer"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-sky-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Location</label>
              <input
                type="text"
                value={props.location || ''}
                onChange={(e) => onPropChange('location', e.target.value)}
                placeholder="Remote, United States"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-sky-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Results</label>
              <input
                type="number"
                value={props.maxResults || 15}
                onChange={(e) => onPropChange('maxResults', Number(e.target.value))}
                min={1}
                max={50}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-sky-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Scroll Passes</label>
              <input
                type="number"
                value={props.autoScrollPasses ?? 2}
                onChange={(e) => onPropChange('autoScrollPasses', Number(e.target.value))}
                min={0}
                max={10}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-sky-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'linkedinResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-sky-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'job'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-sky-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'linkedinResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="sky"
          />
        </div>
      )}

      {/* 5. AMAZON SCRAPER */}
      {nodeType === 'amazon_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
            <span className="flex items-center gap-1.5 font-medium">
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <span>Amazon Scraper (amazon-buddy Engine)</span>
            </span>
            <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Free & Keyless</span>
          </div>

          {/* Engine Selector: Browser DOM vs amazon-buddy Engine */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Extraction Engine</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('engine', 'browser')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  (props.engine || 'browser') === 'browser'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🌐 Browser (DOM)</span>
              </button>
              <button
                type="button"
                onClick={() => onPropChange('engine', 'amazon_buddy')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  props.engine === 'amazon_buddy'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Uses amazon-buddy catalog engine: Zero tabs opened, direct ASIN, price, rating & prime extraction"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>amazon-buddy (API)</span>
              </button>
            </div>
            {props.engine === 'amazon_buddy' ? (
              <p className="text-[10px] text-amber-400/90 mt-1">
                ⚡ amazon-buddy engine: runs with 0 tabs opened! Extracts product ASINs, prices, ratings, and Prime status directly.
              </p>
            ) : null}
          </div>

          {renderExecutionConfig('text-amber-500', props.engine || 'browser')}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrape Mode</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('mode', 'search')}
                className={`py-1 text-[11px] font-medium rounded transition-colors ${
                  (props.mode || 'search') === 'search'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Products Search
              </button>
              <button
                type="button"
                onClick={() => onPropChange('mode', 'product_reviews')}
                className={`py-1 text-[11px] font-medium rounded transition-colors ${
                  props.mode === 'product_reviews'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Customer Reviews
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Search Keywords</label>
              <input
                type="text"
                value={props.query || ''}
                onChange={(e) => onPropChange('query', e.target.value)}
                placeholder="mechanical keyboard"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Domain</label>
              <select
                value={props.domain || 'com'}
                onChange={(e) => onPropChange('domain', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
              >
                <option value="com">.com (US)</option>
                <option value="co.uk">.co.uk (UK)</option>
                <option value="de">.de (DE)</option>
                <option value="ca">.ca (CA)</option>
                <option value="in">.in (IN)</option>
                <option value="co.jp">.co.jp (JP)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
              <input
                type="checkbox"
                checked={!!props.primeOnly}
                onChange={(e) => onPropChange('primeOnly', e.target.checked)}
                className="rounded border-[#232a3b] bg-[#161a24] text-amber-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span>Prime-Only Listings</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'amazonResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'product'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'amazonResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="amber"
          />
        </div>
      )}

      {/* 6. TWITTER / X SCRAPER */}
      {nodeType === 'twitter_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-300">
            <span className="flex items-center gap-1.5 font-medium">
              <AtSign className="w-4 h-4 text-cyan-400" />
              <span>X (Twitter) Public Scraper</span>
            </span>
            <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded">No Key Needed</span>
          </div>

          {/* Engine Selector: twitter_scraper vs Browser DOM vs syndication_api */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Extraction Engine</label>
            <div className="grid grid-cols-3 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('engine', 'twitter_scraper')}
                className={`py-1 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                  (props.engine || 'twitter_scraper') === 'twitter_scraper'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Uses @the-convocation/twitter-scraper: Zero tabs opened, high performance, extracts tweets, likes, retweets, views, and permanent URLs"
              >
                <Sparkles className="w-3 h-3 text-cyan-300" />
                <span>twitter-scraper</span>
              </button>
              <button
                type="button"
                onClick={() => onPropChange('engine', 'browser')}
                className={`py-1 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                  props.engine === 'browser'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Browser DOM: Opens an active or headless browser tab to scrape rendered elements"
              >
                <span>🌐 Browser (DOM)</span>
              </button>
              <button
                type="button"
                onClick={() => onPropChange('engine', 'syndication_api')}
                className={`py-1 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                  props.engine === 'syndication_api'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Twitter Syndication API (react-tweet): Zero tabs opened oEmbed fallback"
              >
                <span>react-tweet</span>
              </button>
            </div>
            {(props.engine || 'twitter_scraper') === 'twitter_scraper' ? (
              <div className="space-y-1 mt-1.5">
                <p className="text-[10px] text-cyan-400/90 leading-tight">
                  ⚡ <strong>@the-convocation/twitter-scraper</strong> engine: Zero tabs opened! Directly streams tweets, text, likes, retweets, replies, views, timestamps, and media URLs.
                </p>
              </div>
            ) : props.engine === 'syndication_api' ? (
              <p className="text-[10px] text-cyan-400/90 mt-1">
                ⚡ Syndication API engine: runs with 0 tabs opened using public oEmbed / syndication endpoints.
              </p>
            ) : null}
          </div>

          {renderExecutionConfig('text-cyan-500', props.engine || 'twitter_scraper')}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrape Mode</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('mode', 'search')}
                className={`py-1 text-[11px] font-medium rounded transition-colors ${
                  (props.mode || 'search') === 'search'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Search / Hashtags
              </button>
              <button
                type="button"
                onClick={() => onPropChange('mode', 'profile_tweets')}
                className={`py-1 text-[11px] font-medium rounded transition-colors ${
                  props.mode === 'profile_tweets'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                User Timeline
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              {(props.mode || 'search') === 'profile_tweets' ? 'Username (@)' : 'Search Keywords or Query'}
            </label>
            <input
              type="text"
              value={(props.mode || 'search') === 'profile_tweets' ? (props.username || '') : (props.query || '')}
              onChange={(e) => onPropChange((props.mode || 'search') === 'profile_tweets' ? 'username' : 'query', e.target.value)}
              placeholder={(props.mode || 'search') === 'profile_tweets' ? 'e.g. OpenAI' : 'e.g. AI automation'}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Results</label>
              <input
                type="number"
                value={props.maxResults || 15}
                onChange={(e) => onPropChange('maxResults', Number(e.target.value))}
                min={1}
                max={50}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Scroll Passes</label>
              <input
                type="number"
                value={props.autoScrollPasses ?? 3}
                onChange={(e) => onPropChange('autoScrollPasses', Number(e.target.value))}
                min={0}
                max={15}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'twitterResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'tweet'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'twitterResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="cyan"
          />
        </div>
      )}

      {/* 7. GOOGLE SEARCH SCRAPER */}
      {nodeType === 'google_search_scraper' && (
        <div className="space-y-4">
          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Search className="w-4 h-4 text-emerald-400" />
              <span>Google Search Scraper (google-sr Engine)</span>
            </span>
            <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">Free & Keyless</span>
          </div>

          {/* Engine Selector: Browser DOM vs google_sr Engine */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Extraction Engine</label>
            <div className="grid grid-cols-2 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
              <button
                type="button"
                onClick={() => onPropChange('engine', 'browser')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  (props.engine || 'browser') === 'browser'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🌐 Browser (DOM)</span>
              </button>
              <button
                type="button"
                onClick={() => onPropChange('engine', 'google_sr')}
                className={`py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                  props.engine === 'google_sr'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Uses google-sr engine: Zero tabs opened, direct organic search results, titles, snippets & URLs"
              >
                <Sparkles className="w-3 h-3 text-emerald-300" />
                <span>google-sr (Direct)</span>
              </button>
            </div>
            {props.engine === 'google_sr' ? (
              <p className="text-[10px] text-emerald-400/90 mt-1">
                ⚡ google-sr engine: runs with 0 tabs opened! Parses Google organic search results, rich snippets, and links directly.
              </p>
            ) : null}
          </div>

          {renderExecutionConfig('text-emerald-500', props.engine || 'browser')}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Search Query</label>
            <input
              type="text"
              value={props.query || ''}
              onChange={(e) => onPropChange('query', e.target.value)}
              placeholder="e.g. browser automation tools"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Results</label>
              <input
                type="number"
                value={props.maxResults || 10}
                onChange={(e) => onPropChange('maxResults', Number(e.target.value))}
                min={1}
                max={50}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Pages</label>
              <input
                type="number"
                value={props.pages || 1}
                onChange={(e) => onPropChange('pages', Number(e.target.value))}
                min={1}
                max={5}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Var</label>
              <input
                type="text"
                value={props.outputVariable || 'googleResults'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Var (Loop)</label>
              <input
                type="text"
                value={props.itemVariable || 'searchResult'}
                onChange={(e) => onPropChange('itemVariable', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <TableExportSection
            items={items}
            outputVariable={props.outputVariable || 'googleResults'}
            exportFormat={props.exportFormat}
            exportFilename={props.exportFilename}
            onPropChange={onPropChange}
            accentColor="emerald"
          />
        </div>
      )}
    </div>
  );
};
