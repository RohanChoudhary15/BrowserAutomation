import React, { useState } from 'react';
import { WorkflowNode, NodeRuntimeState } from '../../../types/workflow';
import {
  Video,
  Film,
  Sparkles,
  Clock,
  Download,
  ExternalLink,
  Copy,
  Check,
  Upload,
  X,
  ImageIcon,
  Volume2,
  VolumeX,
  Key,
  Eye,
  EyeOff,
  Monitor,
  Smartphone,
  Square as SquareIcon,
  Layers,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_AURAY_API_KEY } from '../../../ai/videoService';

export interface VideoGeneratorPropertiesProps {
  selectedNode: WorkflowNode;
  onPropChange: (key: string, value: any) => void;
  runtimeState?: NodeRuntimeState;
  variables?: Record<string, any>;
}

export const VideoGeneratorProperties: React.FC<VideoGeneratorPropertiesProps> = ({
  selectedNode,
  onPropChange,
  runtimeState,
  variables = {},
}) => {
  const props = selectedNode.data.properties || {};
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const duration = Number(props.duration) || 15;
  const aspectRatio = props.aspectRatio || '9:16';
  const resolution = String(props.resolution || '768p').toLowerCase().includes('2k') ? '2k' : '768p';
  const sound = props.sound !== false;
  const autoDownload = !!props.autoDownload;

  // Resolve current generated video strictly belonging to this node
  const nodeOutput = runtimeState?.output;
  const dynamic = runtimeState?.dynamicState;
  const isSuccess = runtimeState?.status === 'success';
  const isRunning = runtimeState?.status === 'running';

  const currentVideoUrl: string | null = (() => {
    if (typeof dynamic?.previewVideoUrl === 'string' && dynamic.previewVideoUrl.startsWith('http')) {
      return dynamic.previewVideoUrl;
    }
    if (typeof nodeOutput === 'string' && (nodeOutput.startsWith('http') || nodeOutput.endsWith('.mp4'))) {
      return nodeOutput;
    }
    if (isSuccess && props.outputVariable && typeof variables[props.outputVariable] === 'string') {
      const v = variables[props.outputVariable];
      if (v.startsWith('http') || v.endsWith('.mp4')) return v;
    }
    return null;
  })();

  const handleDownload = async (url: string) => {
    const rawName = props.downloadFilename || `${props.outputVariable || 'generated_video'}.mp4`;
    const filename = rawName.endsWith('.mp4') ? rawName : `${rawName}.mp4`;

    try {
      if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
        chrome.downloads.download({
          url,
          filename,
          saveAs: true,
        });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Mini Header / Badge */}
      <div className="p-2.5 rounded-lg bg-gradient-to-r from-violet-950/40 via-indigo-950/30 to-[#11141c] border border-indigo-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span>MiniMax H3 Video Model</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300 font-mono">
                Auray AI
              </span>
            </div>
            <div className="text-[10px] text-gray-400">
              Text-to-Video & Image-to-Video with synchronized sound
            </div>
          </div>
        </div>
      </div>

      {/* Video Prompt */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-gray-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Video Prompt</span>
          </label>
          <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
        </div>
        <textarea
          rows={3}
          value={props.prompt || ''}
          onChange={(e) => onPropChange('prompt', e.target.value)}
          placeholder="e.g. A cinematic aerial flyover of futuristic Tokyo at night, neon lights, volumetric rain, 4k ultra detailed"
          className="w-full bg-[#11141c] text-white p-2.5 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono leading-relaxed"
        />
        <p className="text-[10px] text-gray-500 mt-1">
          Describe the motion, camera movements (dolly, pan, aerial), environment, and atmosphere.
        </p>
      </div>

      {/* Source Image / First Frame (Image-to-Video) */}
      <div className="p-3 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-gray-300 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>First Frame / Source Image (Image-to-Video)</span>
          </label>
          <span className="text-[10px] text-emerald-400 font-mono">Optional</span>
        </div>
        <p className="text-[10px] text-gray-400 leading-normal">
          Animate a starting image into a full video. Supports HTTP URLs, data URIs, upstream variables (e.g. <code className="text-emerald-300">&#123;&#123;screenshotUrl&#125;&#125;</code>, <code className="text-emerald-300">&#123;&#123;generatedImageUrl&#125;&#125;</code>), or local upload.
        </p>

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={props.inputImage || ''}
            onChange={(e) => onPropChange('inputImage', e.target.value)}
            placeholder="https://... or {{screenshotUrl}} or data:image/..."
            className="flex-1 bg-[#0b0e14] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none text-xs font-mono"
          />
          <label
            className="px-2.5 py-2 bg-[#1c2230] hover:bg-[#283145] text-gray-300 hover:text-white rounded-lg border border-[#2a3449] cursor-pointer flex items-center gap-1.5 text-[11px] font-medium transition-colors shrink-0"
            title="Upload local image as first frame"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Upload</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    if (evt.target?.result) {
                      onPropChange('inputImage', evt.target.result as string);
                    }
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </label>
          {props.inputImage && (
            <button
              type="button"
              onClick={() => onPropChange('inputImage', '')}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg border border-[#232a3b] transition-colors"
              title="Clear input image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Insert Variables */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] text-gray-500">Quick insert:</span>
          {['{{screenshotUrl}}', '{{generatedImageUrl}}', '{{lastScreenshot}}'].map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => onPropChange('inputImage', variable)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161a24] hover:bg-indigo-950/40 text-gray-400 hover:text-indigo-300 border border-[#232a3b] hover:border-indigo-500/30 transition-colors"
            >
              {variable}
            </button>
          ))}
        </div>

        {/* Thumbnail Preview */}
        {props.inputImage && (props.inputImage.startsWith('http') || props.inputImage.startsWith('data:image')) && (
          <div className="flex items-center gap-2.5 pt-2 border-t border-[#1c2230]">
            <img
              src={props.inputImage}
              alt="First frame reference"
              className="w-12 h-12 object-cover rounded-lg border border-[#2a3449] bg-black"
            />
            <div className="text-[10px] text-gray-400 truncate flex-1">
              <span className="font-semibold text-emerald-400 block flex items-center gap-1">
                <span>First Frame Active</span>
                <span className="text-[9px] bg-emerald-950/50 text-emerald-300 px-1 rounded">img2vid</span>
              </span>
              <span className="text-gray-400 font-mono truncate block">
                {props.inputImage.startsWith('data:') ? 'Base64 image data' : props.inputImage}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Duration & Aspect Ratio Grid */}
      <div className="space-y-3">
        {/* Aspect Ratio */}
        <div>
          <label className="block text-[11px] font-medium text-gray-300 mb-1.5">
            Aspect Ratio
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { ratio: '9:16', label: '9:16', desc: 'Reels/TikTok', icon: Smartphone },
              { ratio: '16:9', label: '16:9', desc: 'Landscape', icon: Monitor },
              { ratio: '1:1', label: '1:1', desc: 'Square', icon: SquareIcon },
              { ratio: '4:3', label: '4:3', desc: 'Standard', icon: Monitor },
              { ratio: '3:4', label: '3:4', desc: 'Portrait', icon: Smartphone },
            ].map(({ ratio, label, desc, icon: IconComponent }) => {
              const isSelected = aspectRatio === ratio;
              return (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => onPropChange('aspectRatio', ratio)}
                  className={`py-2 px-1 rounded-lg border flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-md shadow-indigo-900/30'
                      : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white hover:bg-[#161a24]'
                  }`}
                  title={`${ratio} - ${desc}`}
                >
                  <IconComponent className="w-3.5 h-3.5 mb-1 opacity-80" />
                  <span className="text-[11px] font-mono leading-none">{label}</span>
                  <span className="text-[8px] mt-0.5 opacity-70 truncate max-w-full leading-none">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Duration & Resolution */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Duration */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-400" />
                <span>Duration</span>
              </label>
              <span className="text-[10px] font-mono text-indigo-400">{duration} seconds</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[5, 10, 15].map((sec) => {
                const isSelected = duration === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => onPropChange('duration', sec)}
                    className={`py-1.5 text-center rounded-lg border text-xs font-mono font-medium transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-sm'
                        : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white hover:bg-[#161a24]'
                    }`}
                  >
                    {sec}s
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-[11px] font-medium text-gray-300 mb-1">
              Quality / Resolution
            </label>
            <div className="grid grid-cols-2 gap-1">
              {[
                { id: '768p', label: '768p', desc: 'Standard' },
                { id: '2k', label: '2k', desc: 'High Def' },
              ].map(({ id, label, desc }) => {
                const isSelected = resolution === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onPropChange('resolution', id)}
                    className={`py-1.5 px-2 text-center rounded-lg border text-xs font-mono font-medium transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-sm'
                        : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white hover:bg-[#161a24]'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[9px] opacity-70 ml-1">({desc})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sound / Audio Toggle */}
      <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sound ? (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-gray-500" />
          )}
          <div>
            <div className="text-xs font-medium text-gray-200">
              Synchronized Audio & Soundscape
            </div>
            <div className="text-[10px] text-gray-400">
              Generates high-fidelity background audio matching scene motion
            </div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => onPropChange('sound', e.target.checked)}
          className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600 w-4 h-4 cursor-pointer"
        />
      </div>

      {/* Auray Platform API Key */}
      <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-gray-300 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Auray API Key</span>
          </label>
          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/20 font-mono">
            {props.apiKey ? 'Custom Key' : 'Default Included'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={props.apiKey || ''}
            onChange={(e) => onPropChange('apiKey', e.target.value)}
            placeholder={DEFAULT_AURAY_API_KEY ? 'Using preconfigured default Auray key' : 'auray_sk_...'}
            className="flex-1 bg-[#0b0e14] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="p-2 rounded-lg bg-[#1c2230] hover:bg-[#283145] text-gray-400 hover:text-white border border-[#2a3449] transition-colors"
            title={showApiKey ? 'Hide key' : 'Show key'}
          >
            {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-500">
          Leave blank to use the built-in Auray AI MiniMax H3 API key.
        </p>
      </div>

      {/* Auto Download Video Checkbox */}
      <div className="space-y-2 pt-1 border-t border-[#1c2230]">
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(e) => onPropChange('autoDownload', e.target.checked)}
            className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
          />
          <span className="text-[11px] flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            Auto-download generated video (.mp4)
          </span>
        </label>

        {autoDownload && (
          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-1">Save Filename</label>
            <input
              type="text"
              value={props.downloadFilename || 'generated_video'}
              onChange={(e) => onPropChange('downloadFilename', e.target.value)}
              placeholder="e.g. reel_{{pageTitle}}"
              className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
          </div>
        )}
      </div>

      {/* Generation State & In-Progress Indicator */}
      {isRunning && (
        <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs text-indigo-300 font-medium">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Generating AI Video...</span>
            </span>
            <span className="font-mono text-[10px] bg-indigo-500/20 px-1.5 py-0.5 rounded">
              {dynamic?.message || 'Processing'}
            </span>
          </div>
          {dynamic?.detail && (
            <p className="text-[10px] text-gray-400 font-mono truncate">{dynamic.detail}</p>
          )}
          {typeof dynamic?.progress === 'number' && (
            <div className="w-full bg-[#1c2230] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-1.5 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(5, dynamic.progress))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Alert Banner (specifically handling browser_origin_refused) */}
      {runtimeState?.status === 'error' && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {String(runtimeState?.error || dynamic?.message || '').includes('browser_origin_refused')
                ? 'Extension Reload Required for Auray Rules'
                : 'Video Generation Error'}
            </span>
          </div>
          <p className="text-[10px] text-gray-300 leading-relaxed font-mono">
            {runtimeState?.error || dynamic?.message || 'An error occurred during video generation.'}
          </p>
          {String(runtimeState?.error || dynamic?.message || '').includes('browser_origin_refused') && (
            <div className="pt-1">
              <button
                type="button"
                onClick={async () => {
                  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    try {
                      await chrome.runtime.sendMessage({ type: 'RELOAD_EXTENSION' });
                    } catch {}
                  }
                  window.location.reload();
                }}
                className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Extension & Retry</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generated Video Player Strictly Scoped to This Node */}
      {currentVideoUrl && (
        <div className="p-3 rounded-xl bg-gradient-to-b from-[#11141c] to-[#0a0d14] border border-[#232a3b] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Video className="w-4 h-4 text-emerald-400" />
              <span>Generated Video Preview</span>
            </div>
            <span className="text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              {duration}s • {aspectRatio}
            </span>
          </div>

          <div className="relative rounded-lg overflow-hidden border border-[#2a3449] bg-black flex items-center justify-center">
            <video
              src={currentVideoUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="w-full max-h-64 object-contain bg-black"
            />
          </div>

          {/* Video Action Buttons */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleDownload(currentVideoUrl)}
              className="py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              title="Download MP4 video file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>

            <a
              href={currentVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="py-1.5 px-2 rounded-lg bg-[#161a24] hover:bg-[#202738] text-gray-300 hover:text-white text-xs font-medium border border-[#232a3b] flex items-center justify-center gap-1.5 transition-colors text-center"
              title="Open video in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              <span>Open Tab</span>
            </a>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(currentVideoUrl);
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 2000);
              }}
              className="py-1.5 px-2 rounded-lg bg-[#161a24] hover:bg-[#202738] text-gray-300 hover:text-white text-xs font-medium border border-[#232a3b] flex items-center justify-center gap-1.5 transition-colors"
              title="Copy video URL to clipboard"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
              <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
