import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Play,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import { BackgroundAnimationPreset } from './AmbientBackgroundCanvas';
import { workspaceApi } from '../lib/apiClient';

interface VisualMotionStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePreset: BackgroundAnimationPreset;
  onSelectPreset: (preset: BackgroundAnimationPreset) => void;
  speedMultiplier: number;
  onChangeSpeed: (speed: number) => void;
  customKeyframeUrl: string | null;
  onSetCustomKeyframeUrl: (url: string | null) => void;
  customVideoUrl: string | null;
  onSetCustomVideoUrl: (url: string | null) => void;
  onReplayOpeningIntro: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const PRESET_OPTIONS: Array<{
  id: BackgroundAnimationPreset;
  title: string;
  engine: string;
  description: string;
}> = [
  {
    id: 'constellation',
    title: 'Omni Neural Constellation',
    engine: '60fps Vector Graph + RRF Packets',
    description:
      'Interactive 384-d semantic nodes with cursor gravity and live data packets traveling along cosine similarity edges.',
  },
  {
    id: 'aurora',
    title: 'Nano Banana Aurora Silk',
    engine: 'Multi-Layer Fluid Ribbon Shader',
    description:
      'Soft cobalt, violet, and cyan silk waves drifting across the alabaster canvas with translucent depth.',
  },
  {
    id: 'matrix',
    title: 'Vector Horizon Lattice',
    engine: 'Isometric Perspective Grid',
    description:
      'Architectural coordinate grid with floating semantic nodes and subtle parallax motion.',
  },
  {
    id: 'minimal',
    title: 'Minimal Architectural Focus',
    engine: 'Static Ambient Spotlight',
    description:
      'Disables active canvas motion for pure, zero-distraction document reading and auditing.',
  },
];

const PROMPT_SUGGESTIONS = [
  'Translucent glassmorphic neural lattice floating in warm alabaster daylight with cobalt indigo light rays',
  'Crystalline semantic vector prisms connected by glowing cyan fiber optic threads in a clean architectural studio',
  'Abstract fluid silk ribbons of electric indigo and soft violet over a minimalist white gallery space',
];

export const VisualMotionStudioModal: React.FC<VisualMotionStudioModalProps> = ({
  isOpen,
  onClose,
  activePreset,
  onSelectPreset,
  speedMultiplier,
  onChangeSpeed,
  customKeyframeUrl,
  onSetCustomKeyframeUrl,
  customVideoUrl,
  onSetCustomVideoUrl,
  onReplayOpeningIntro,
  onNotify,
}) => {
  const [prompt, setPrompt] = useState(PROMPT_SUGGESTIONS[0]);
  const [isGeneratingNano, setIsGeneratingNano] = useState(false);
  const [isGeneratingOmni, setIsGeneratingOmni] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);

  const handleGenerateNanoBanana = async () => {
    if (!prompt.trim()) return;
    setIsGeneratingNano(true);
    try {
      const res = await workspaceApi.generateNanoBananaImage({
        prompt: prompt.trim(),
        aspect_ratio: '16:9',
      });
      onSetCustomKeyframeUrl(res.image_url);
      onSetCustomVideoUrl(null);
      setLastModelUsed(`${res.model} (${res.latency_ms}ms)`);
      onNotify(
        'success',
        `Applied Nano Banana keyframe backdrop (${res.model}).`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'Nano Banana generation failed.');
    } finally {
      setIsGeneratingNano(false);
    }
  };

  const handleGenerateOmniLoop = async () => {
    if (!prompt.trim()) return;
    setIsGeneratingOmni(true);
    try {
      const res = await workspaceApi.generateOmniMotionLoop({
        prompt: prompt.trim(),
        preset: activePreset === 'minimal' ? 'aurora' : activePreset,
      });
      if (res.video_url) {
        onSetCustomVideoUrl(res.video_url);
      } else {
        onSelectPreset('aurora');
      }
      setLastModelUsed(`${res.model} (${res.latency_ms}ms)`);
      onNotify(
        'success',
        `Activated Omni Flash motion loop (${res.model}).`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'Omni Flash motion synthesis failed.');
    } finally {
      setIsGeneratingOmni(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nano Banana & Omni Flash Motion Studio"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-black/70 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111420] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0D101A] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Nano Banana & Omni Flash Motion Studio
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Customize opening choreography, 60fps background shaders, and AI-synthesized keyframes
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReplayOpeningIntro();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Replay Opening Intro</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Motion Studio"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* 1. Ambient Background Animation Presets */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Live Ambient Background Animation Engine</span>
                  </label>

                  {/* Speed Multiplier Selector */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 text-[11px]">Speed:</span>
                    {[
                      { label: '0.6x Calm', val: 0.6 },
                      { label: '1.0x Normal', val: 1 },
                      { label: '1.6x Dynamic', val: 1.6 },
                    ].map((s) => (
                      <button
                        key={s.val}
                        type="button"
                        onClick={() => onChangeSpeed(s.val)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          speedMultiplier === s.val
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRESET_OPTIONS.map((item) => {
                    const isSelected = activePreset === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectPreset(item.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1.5 ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/15 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0B0D14] hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.title}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                          {item.engine}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Nano Banana & Omni Flash Interactions Generator */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0D14] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Synthesize Custom Backdrop with Nano Banana & Omni Flash
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Uses `gemini-3.1-flash-lite-image` (Nano Banana) and `gemini-omni-1.1-flash` (Omni Flash) via `/api/media/*`
                    </p>
                  </div>
                  {(customKeyframeUrl || customVideoUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetCustomKeyframeUrl(null);
                        onSetCustomVideoUrl(null);
                        onNotify('success', 'Reset custom backdrop layer.');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear Backdrop</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe an ambient architectural backdrop or motion loop..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111420] p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />

                  <div className="flex flex-wrap gap-1.5">
                    {PROMPT_SUGGESTIONS.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPrompt(s)}
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111420] hover:border-indigo-400 text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[260px] cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isGeneratingNano || isGeneratingOmni}
                    onClick={handleGenerateNanoBanana}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    {isGeneratingNano ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    <span>Generate Nano Banana Keyframe</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingNano || isGeneratingOmni}
                    onClick={handleGenerateOmniLoop}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isGeneratingOmni ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Film className="w-3.5 h-3.5" />
                    )}
                    <span>Synthesize Omni Motion Loop</span>
                  </button>

                  {lastModelUsed && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 ml-auto">
                      Active: {lastModelUsed}
                    </span>
                  )}
                </div>

                {customKeyframeUrl && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-[#111420]">
                    <img
                      src={customKeyframeUrl}
                      alt="Generated Nano Banana Backdrop Preview"
                      className="w-full h-36 object-cover"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D14] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                60fps hardware-accelerated canvas · Respects `prefers-reduced-motion`
              </span>
              <button
                type="button"
                onClick={onClose}
                className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 cursor-pointer"
              >
                Apply & Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
