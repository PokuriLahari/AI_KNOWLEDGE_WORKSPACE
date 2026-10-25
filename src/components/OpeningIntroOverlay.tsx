import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

interface OpeningIntroOverlayProps {
  isOpen: boolean;
  onComplete: () => void;
  customKeyframeUrl?: string | null;
}

const IGNITION_STAGES = [
  { id: '01', label: 'ChromaDB HNSW Vector Index', detail: '384-d Dense Cosine' },
  { id: '02', label: 'BM25 Sparse Lexical Engine', detail: 'Reciprocal Rank Fusion' },
  { id: '03', label: 'Nano Banana & Omni Visual Core', detail: '60fps Shader Telemetry' },
  { id: '04', label: 'Multi-Agent Citation Router', detail: 'Zero-Fabrication SLA' },
];

export const OpeningIntroOverlay: React.FC<OpeningIntroOverlayProps> = ({
  isOpen,
  onComplete,
  customKeyframeUrl,
}) => {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setActiveStage(0);
      return;
    }

    const t1 = setTimeout(() => setActiveStage(1), 320);
    const t2 = setTimeout(() => setActiveStage(2), 680);
    const t3 = setTimeout(() => setActiveStage(3), 1040);
    const t4 = setTimeout(() => setActiveStage(4), 1400);
    const doneTimer = setTimeout(() => {
      onComplete();
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(doneTimer);
    };
  }, [isOpen, onComplete]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#07090F] text-slate-900 dark:text-white overflow-hidden select-none"
        >
          {/* Optional Custom Nano Banana Keyframe Backdrop */}
          {customKeyframeUrl && (
            <img
              src={customKeyframeUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30 dark:opacity-25 pointer-events-none"
            />
          )}

          {/* Animated SVG Orbital Vector Prism */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <motion.svg
              initial={{ scale: 0.75, opacity: 0, rotate: -25 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              viewBox="0 0 600 600"
              className="w-[460px] h-[460px] sm:w-[580px] sm:h-[580px]"
            >
              <defs>
                <radialGradient id="introGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.22" />
                  <stop offset="55%" stopColor="#0EA5E9" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.55" />
                  <stop offset="50%" stopColor="#0EA5E9" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.55" />
                </linearGradient>
              </defs>
              <circle cx="300" cy="300" r="260" fill="url(#introGlow)" />
              <motion.circle
                cx="300"
                cy="300"
                r="190"
                fill="none"
                stroke="url(#ringGrad)"
                strokeWidth="1.2"
                strokeDasharray="8 8"
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                style={{ transformOrigin: '300px 300px' }}
              />
              <motion.circle
                cx="300"
                cy="300"
                r="235"
                fill="none"
                stroke="url(#ringGrad)"
                strokeWidth="1"
                strokeOpacity="0.45"
                animate={{ rotate: -360 }}
                transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                style={{ transformOrigin: '300px 300px' }}
              />
            </motion.svg>
          </div>

          {/* Center Choreographed Emblem & Pipeline Ignition */}
          <div className="relative z-10 max-w-lg w-full px-6 text-center space-y-6">
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-xl shadow-indigo-600/25 border border-indigo-400/40"
            >
              KW
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="space-y-2"
            >
              <div className="text-[11px] font-mono font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                Multi-Agent Document Intelligence System · v4.2
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                Knowledge Workspace
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Initializing Hybrid Vector Retrieval, Google Drive Sync & Omni Motion Core
              </p>
            </motion.div>

            {/* 4-Stage Ignition Progress Grid */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22 }}
              className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-[#0D101A]/90 backdrop-blur-md p-4 shadow-lg text-left space-y-2.5"
            >
              {IGNITION_STAGES.map((stage, idx) => {
                const isDone = activeStage > idx;
                const isCurrent = activeStage === idx;
                return (
                  <div
                    key={stage.id}
                    className="flex items-center justify-between gap-3 text-xs py-1"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          isDone
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isCurrent
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-400 dark:text-slate-600'
                        }`}
                      >
                        {stage.id}
                      </span>
                      <span
                        className={`font-medium truncate ${
                          isDone || isCurrent
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                        {stage.detail}
                      </span>
                      <CheckCircle2
                        className={`w-3.5 h-3.5 transition-colors duration-200 ${
                          isDone
                            ? 'text-emerald-500'
                            : isCurrent
                              ? 'text-indigo-500 animate-pulse'
                              : 'text-slate-300 dark:text-slate-700'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Smooth Progress Bar */}
              <div className="pt-1">
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <motion.div
                    initial={{ width: '8%' }}
                    animate={{ width: `${Math.min(100, (activeStage / 4) * 100)}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-indigo-600 via-sky-500 to-indigo-600 rounded-full"
                  />
                </div>
              </div>
            </motion.div>

            {/* Instant Skip / Enter Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={onComplete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111522] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs"
              >
                <span>Enter Workspace Immediately</span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
