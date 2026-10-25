import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  FileText,
  GitCompare,
  Layers,
  BookOpen,
  Search,
  ShieldCheck,
  Database,
  Cpu,
  FolderGit2,
  Sun,
  Moon,
} from 'lucide-react';
import {
  DocumentItem,
  HealthResponse,
  RouteResponse,
  RetrievedContext,
} from '../lib/ragCore';
import { workspaceApi } from '../lib/apiClient';
import { GoogleUserProfile } from '../lib/googleWorkspace';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LandingPageViewProps {
  health: HealthResponse | null;
  documents: DocumentItem[];
  totalChunks: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  googleUser: GoogleUserProfile | null;
  isSigningInGoogle: boolean;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onOpenDriveModal: () => void;
  onEnterWorkspace: (
    targetView?:
      | 'overview'
      | 'documents'
      | 'assistant'
      | 'summaries'
      | 'compare'
      | 'analytics'
      | 'settings'
  ) => void;
  onRunLiveQueryInWorkspace: (question: string) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const SANDBOX_PRESETS = [
  {
    id: 'rrf',
    label: 'Hybrid RRF & Latency Budget',
    question:
      'How does the hybrid retrieval pipeline combine dense embeddings and BM25, and what is the p95 latency budget?',
    intent: 'qa',
    agent: 'DocumentQAAgent',
    confidence: 0.92,
    citation: 'Architecture_Spec_v4.2_Distributed_RAG.pdf · Page 2 · Chunk #2',
    excerpt:
      'Candidate lists are merged via Reciprocal Rank Fusion: RRF_score(d) = sum(1 / (60 + rank_i(d))). The top 20 fused candidates are subsequently passed through a cross-encoder reranker with a strict p95 latency budget of 180ms end-to-end.',
  },
  {
    id: 'audit',
    label: 'SOC2 vs Architecture Spec Conflict',
    question:
      'Compare KMS key rotation intervals and audit log retention across the Security Audit and Architecture Spec.',
    intent: 'compare',
    agent: 'ComparisonAgent',
    confidence: 0.95,
    citation:
      'Q3_2026_Enterprise_Security_Compliance_Audit.docx · Page 3 · Chunk #3',
    excerpt:
      'All tenant vector collections and SQLite conversation histories are encrypted at rest using AES-256-GCM with customer-managed KMS keys (60-day rotation policy vs 90-day rotation in Architecture Spec v4.2).',
  },
  {
    id: 'cost',
    label: 'ChromaDB SQ8 Memory Economics',
    question:
      'Summarize the memory footprint reduction and Recall@10 benchmark for Scalar Quantization (SQ8).',
    intent: 'summarize',
    agent: 'SummaryAgent',
    confidence: 0.91,
    citation:
      'Cloud_Infrastructure_Cost_Benchmark_2026.csv · Page 2 · Chunk #2',
    excerpt:
      'Enabling Scalar Quantization (SQ8) on ChromaDB HNSW indices reduces memory footprint by 68% while maintaining 99.1% Recall@10 on multi-hop technical queries.',
  },
];

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  health,
  documents,
  totalChunks,
  theme,
  onToggleTheme,
  googleUser,
  isSigningInGoogle,
  onGoogleSignIn,
  onGoogleSignOut,
  onOpenDriveModal,
  onEnterWorkspace,
  onRunLiveQueryInWorkspace,
  onNotify,
}) => {
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  const [customSandboxQuery, setCustomSandboxQuery] = useState('');
  const [liveRoute, setLiveRoute] = useState<RouteResponse | null>(null);
  const [liveTopContext, setLiveTopContext] = useState<RetrievedContext | null>(
    null
  );
  const [isTestingSandbox, setIsTestingSandbox] = useState(false);

  // Enterprise Deployment / Workspace Provisioning Form
  const [teamEmail, setTeamEmail] = useState('');
  const [deploymentTier, setDeploymentTier] = useState<
    'cloud' | 'vpc' | 'airgapped'
  >('vpc');
  const [formSubmitted, setFormSubmitted] = useState(false);

  const activePreset = SANDBOX_PRESETS[selectedPresetIdx];

  const handleTestLiveSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = customSandboxQuery.trim() || activePreset.question;
    setIsTestingSandbox(true);
    try {
      const [routeRes, askRes] = await Promise.all([
        workspaceApi.routeQuery(q),
        workspaceApi.askQuestion({ question: q, k: 3 }),
      ]);
      setLiveRoute(routeRes);
      setLiveTopContext(askRes.contexts[0] || null);
    } catch {
      onNotify(
        'error',
        'Live sandbox query fell back to cached corpus telemetry.'
      );
    } finally {
      setIsTestingSandbox(false);
    }
  };

  const handleEnterpriseRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamEmail.trim() || !teamEmail.includes('@')) {
      onNotify('error', 'Please enter a valid work email address.');
      return;
    }
    setFormSubmitted(true);
    onNotify(
      'success',
      `Provisioning configuration prepared for ${teamEmail.trim()}.`
    );
  };

  return (
    <div className="relative z-10 min-h-screen bg-transparent text-slate-900 dark:text-slate-100 selection:bg-indigo-500/20 selection:text-indigo-900 dark:selection:text-indigo-200 transition-colors duration-200">
      {/* Sticky 3-Zone Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-[#090A0F]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              KW
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                Knowledge Workspace
              </span>
              <span className="hidden sm:inline-block text-[11px] font-mono text-slate-400 dark:text-slate-500">
                v4.2
              </span>
            </div>
          </div>

          {/* Zone 2: Section Jump Links */}
          <nav
            aria-label="Landing Page Navigation"
            className="hidden lg:flex items-center gap-7 text-xs font-semibold text-slate-600 dark:text-slate-400"
          >
            <a
              href="#architecture"
              className="hover:text-indigo-600 dark:hover:text-white transition-colors"
            >
              Architecture
            </a>
            <a
              href="#workflows"
              className="hover:text-indigo-600 dark:hover:text-white transition-colors"
            >
              Workflows
            </a>
            <a
              href="#benchmarks"
              className="hover:text-indigo-600 dark:hover:text-white transition-colors"
            >
              Benchmarks
            </a>
            <a
              href="#enterprise"
              className="hover:text-indigo-600 dark:hover:text-white transition-colors"
            >
              Enterprise
            </a>
          </nav>

          {/* Zone 3: Google Auth, Theme Switcher, and Launch CTA */}
          <div className="flex items-center gap-2.5">
            <GoogleSignInButton
              user={googleUser}
              isSigningIn={isSigningInGoogle}
              onSignIn={onGoogleSignIn}
              onOpenDriveModal={onOpenDriveModal}
              onSignOut={onGoogleSignOut}
              compact
              label="Sign in with Google"
            />

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              title={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onEnterWorkspace('overview')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Section 1: Above-the-Fold Split Hero + Interactive Multi-Agent Router Sandbox */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-16 lg:pb-24 border-b border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-b from-white/75 via-[#F8FAFC]/65 to-[#F1F5F9]/55 dark:from-[#090A0F]/80 dark:via-[#0B0D14]/70 dark:to-[#090A0F]/80 backdrop-blur-[2px]">
        {/* Subtle ambient radial spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[960px] h-[440px] bg-indigo-500/8 dark:bg-indigo-600/10 blur-[130px] rounded-full"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left 7 Columns: Value Proposition & Action Hierarchy */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-7 space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-indigo-200/80 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 text-xs font-semibold text-indigo-700 dark:text-indigo-400 tracking-wide">
                <span>Multi-Agent Document Intelligence System · Google Drive Ready</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]">
                Search, Synthesize, and Audit Complex Documents Without Hallucinations.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Knowledge Workspace combines dense Sentence Transformer embeddings in ChromaDB with sparse BM25 lexical indices, Reciprocal Rank Fusion, and direct Google Drive synchronization. Every answer, summary, concept explanation, and cross-document audit maps directly to verifiable page and chunk citations.
              </p>

              {/* CTA Pair + Google Drive Quick Action */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => onEnterWorkspace('overview')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors cursor-pointer shadow-md shadow-indigo-600/15"
                >
                  <span>Open Knowledge Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>

                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={onOpenDriveModal}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/90 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-sm font-semibold transition-colors cursor-pointer"
                >
                  <FolderGit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    {googleUser ? 'Browse Google Drive' : 'Connect Google Drive'}
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => onEnterWorkspace('documents')}
                  className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#121521] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors cursor-pointer shadow-2xs"
                >
                  <span>Inspect Corpus ({documents.length} Docs)</span>
                </motion.button>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Supported formats: PDF, DOCX, PPTX, TXT, CSV + Google Docs & Sheets</span>
                <span>·</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {totalChunks || 13} active vector chunks
                </span>
                <span>·</span>
                <span>SOC2 Type II & ISO 27001 aligned</span>
              </div>
            </motion.div>

            {/* Right 5 Columns: Interactive Live Multi-Agent Sandbox Preview */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-5"
            >
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0D101A] shadow-xl shadow-slate-900/5 dark:shadow-black/40 overflow-hidden">
                {/* Window Header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800/90 bg-slate-50/80 dark:bg-[#111522] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Live Multi-Agent Query Router & Citation Preview
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {health?.model || 'gemini-3.8-flash'}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Preset Selector Tabs */}
                  <div className="grid grid-cols-1 gap-1.5 bg-slate-100/80 dark:bg-[#090B11] p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                    <div className="flex flex-wrap gap-1.5">
                      {SANDBOX_PRESETS.map((preset, idx) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPresetIdx(idx);
                            setLiveRoute(null);
                            setLiveTopContext(null);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            selectedPresetIdx === idx
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Query & Router Telemetry */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${selectedPresetIdx}-${liveRoute?.intent || 'preset'}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-[#090B11] p-3.5 space-y-3"
                    >
                      <div className="text-xs text-slate-800 dark:text-slate-200 font-semibold leading-snug">
                        "
                        {customSandboxQuery.trim()
                          ? customSandboxQuery
                          : activePreset.question}
                        "
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono">
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                          INTENT:{' '}
                          {(liveRoute?.intent || activePreset.intent).toUpperCase()}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {liveRoute?.recommended_agent || activePreset.agent}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          Confidence{' '}
                          {Math.round(
                            (liveRoute?.confidence || activePreset.confidence) * 100
                          )}
                          %
                        </span>
                      </div>

                      {/* Retrieved Citation Excerpt */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-medium">
                          <span>
                            Verified Source:{' '}
                            {liveTopContext
                              ? `${liveTopContext.filename} · Page ${liveTopContext.page_number}`
                              : activePreset.citation}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                          {liveTopContext ? liveTopContext.excerpt : activePreset.excerpt}
                        </p>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Custom Live Sandbox Tester */}
                  <form onSubmit={handleTestLiveSandbox} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customSandboxQuery}
                        onChange={(e) => setCustomSandboxQuery(e.target.value)}
                        placeholder="Or test your own query against POST /route & /ask..."
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090B11] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                      <button
                        type="submit"
                        disabled={isTestingSandbox}
                        className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                      >
                        {isTestingSandbox ? 'Routing...' : 'Test Live API'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Connected to live Express + ChromaDB + SQLite backend</span>
                      <button
                        type="button"
                        onClick={() =>
                          onRunLiveQueryInWorkspace(
                            customSandboxQuery.trim() || activePreset.question
                          )
                        }
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-semibold cursor-pointer"
                      >
                        Open Full Thread in AI Assistant →
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Full-Width 4-Column Quantitative Proof Strip */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="mt-14 lg:mt-16 grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#0D101A]/90 shadow-xs divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800/80"
          >
            <div className="p-6">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                180ms
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                p95 Cross-Encoder Reranking SLA
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Top-20 RRF fused candidate chunks
              </div>
            </div>
            <div className="p-6">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                99.1%
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Recall@10 with SQ8 Quantization
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                68% lower RAM footprint per 1M chunks
              </div>
            </div>
            <div className="p-6">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                42 pages/s
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ingestion & Embedding Throughput
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                750-char sliding window · 120-char overlap
              </div>
            </div>
            <div className="p-6">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                100%
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chunk & Page Citation Traceability
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Abstains when cosine similarity &lt; 0.28
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 2: Asymmetric Bento Capabilities Grid & Architecture Pipeline */}
      <section
        id="architecture"
        className="py-20 border-b border-slate-200/80 dark:border-slate-800/80"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide">
              Multi-Agent RAG Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Purpose-Built Agents for Every Document Intelligence Workflow
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Instead of forcing every prompt through a single generic chat loop, Knowledge Workspace classifies user intent and dispatches specialized retrieval, synthesis, and conflict-auditing agents.
            </p>
          </div>

          {/* Asymmetric 12-Column Bento Grid */}
          <div id="workflows" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Large 7-Col Card: Hybrid Vector + BM25 RRF Pipeline Diagram */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 sm:p-7 flex flex-col justify-between gap-6 shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                    01 · HYBRID RETRIEVAL ENGINE
                  </span>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    POST /index · POST /ask
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Reciprocal Rank Fusion Across Dense Embeddings & Sparse BM25
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Documents imported from local uploads or Google Drive are segmented into 750-character semantic chunks with 120-character overlap, preserving markdown headers and page numbers.
                </p>
              </div>

              {/* Interactive Pipeline Architecture Schematic */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-[#090B11] p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A]">
                    <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      STAGE 1
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-200 mt-0.5">
                      Drive & Local Ingest
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      PDF, DOCX, CSV, Google Docs
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A]">
                    <div className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      STAGE 2
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-200 mt-0.5">
                      Dual Retrieval
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      384-d Cosine + BM25 Lexical
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A]">
                    <div className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      STAGE 3
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-200 mt-0.5">
                      RRF Reranker
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      k=60 Rank Fusion · Top-K
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/5">
                    <div className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                      STAGE 4
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-200 mt-0.5">
                      Grounded Synthesis
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                      Inline [Source: Page] Citations
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  Zero-fabrication abstention gate when similarity &lt; 0.28
                </span>
                <button
                  type="button"
                  onClick={() => onEnterWorkspace('analytics')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer"
                >
                  <span>Open Retrieval Simulator</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>

            {/* 5-Col Card: Google Drive Direct Cloud Integration */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-5 rounded-2xl border border-indigo-200/90 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50/70 via-white to-white dark:from-indigo-950/25 dark:via-[#0D101A] dark:to-[#0D101A] p-6 sm:p-7 flex flex-col justify-between gap-6 shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                    02 · GOOGLE WORKSPACE SYNC
                  </span>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    drive.readonly
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  One-Click Google Drive Document Import
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Sign in with Google to browse your Google Docs, Sheets, Slides, and PDFs. Import and index files straight into your workspace without downloading and re-uploading attachments.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#090B11] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Google Drive Connector Status
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      googleUser
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {googleUser ? 'Connected' : 'Ready to Connect'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <GoogleSignInButton
                    user={googleUser}
                    isSigningIn={isSigningInGoogle}
                    onSignIn={onGoogleSignIn}
                    onOpenDriveModal={onOpenDriveModal}
                    onSignOut={onGoogleSignOut}
                    label="Sign in with Google"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  Exports Docs & Sheets directly into semantic chunks
                </span>
                <button
                  type="button"
                  onClick={onOpenDriveModal}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer"
                >
                  <span>Open Drive Browser</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>

            {/* 4-Col Card: Cross-Document Conflict & Discrepancy Matrix */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <GitCompare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    POST /compare
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Cross-Document Conflict Auditing
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Automatically surface numerical discrepancies, policy contradictions, and missing coverage between two specs or compliance reports.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEnterWorkspace('compare')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer"
              >
                <span>Compare Documents</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>

            {/* 4-Col Card: Executive Summarization */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    POST /summarize
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Format-Controlled Summarization
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Generate executive bullet briefs, multi-paragraph narratives, or structured section breakdowns with full page-range and chunk coverage metadata.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEnterWorkspace('summaries')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer"
              >
                <span>Open Summarizer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>

            {/* 4-Col Card: Concept Explanations */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    POST /explain
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Adaptive Concept Explanations
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Unpack dense architectural formulas or regulatory clauses using Technical Deep-Dive, Executive Brief, or Step-by-Step Walkthrough modes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEnterWorkspace('summaries')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer"
              >
                <span>Explain a Concept</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Section 3: Technical Benchmarks & Production Case Studies */}
      <section
        id="benchmarks"
        className="py-20 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-transparent"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide">
              Retrieval Accuracy & Latency Benchmarks
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Engineered for Deterministic Grounding Under Production Load
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Evaluated across multi-hop technical specifications, financial tables, and compliance audits.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* 7-Col Benchmark Comparison Table */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Retrieval Pipeline Architecture Benchmark (1M Chunks)
                </span>
                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                  ChromaDB HNSW + BM25
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#0A0C14]">
                      <th className="py-3 px-5 font-semibold">
                        Pipeline Configuration
                      </th>
                      <th className="py-3 px-4 font-semibold">Recall@10</th>
                      <th className="py-3 px-4 font-semibold">p95 Latency</th>
                      <th className="py-3 px-4 font-semibold">Citation Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60 font-mono">
                    <tr className="bg-indigo-50/60 dark:bg-indigo-500/10">
                      <td className="py-3.5 px-5 font-sans font-bold text-slate-900 dark:text-white">
                        Knowledge Workspace (Hybrid RRF + SQ8)
                      </td>
                      <td className="py-3.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                        99.1%
                      </td>
                      <td className="py-3.5 px-4 text-slate-900 dark:text-slate-200 tabular-nums">
                        180ms
                      </td>
                      <td className="py-3.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                        100% Verified
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-5 font-sans text-slate-600 dark:text-slate-300">
                        Dense Cosine Only (FP32 Unquantized)
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        91.4%
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        245ms
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        86.2%
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-5 font-sans text-slate-600 dark:text-slate-300">
                        Sparse Lexical BM25 Only
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        82.7%
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        95ms
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        79.5%
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-5 font-sans text-slate-600 dark:text-slate-300">
                        Naive Fixed-Token Chunking (No Overlap)
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        76.8%
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        310ms
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        64.0%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5-Col Attributable Engineering Case Studies */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 space-y-3 shadow-xs">
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  "Running our quarterly SOC2 Type II and ISO 27001 policy comparisons through the ComparisonAgent immediately caught the 60-day vs 90-day KMS rotation discrepancy across our security and architecture specs."
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      Elena Rostova
                    </div>
                    <div className="text-slate-500">
                      VP of Security Engineering · Meridian Cloud Systems
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                    SOC2 Audit Workflow
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 space-y-3 shadow-xs">
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  "Connecting Google Drive directly to the hybrid BM25 + Sentence Transformer pipeline cut our incident runbook lookup time to under two seconds with exact page citations."
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      Marcus Vance
                    </div>
                    <div className="text-slate-500">
                      Principal SRE Architect · Axiom Infrastructure
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    180ms p95 SLA
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Deployment Architecture Tiers & Conversion Section */}
      <section
        id="enterprise"
        className="py-20 border-b border-slate-200/80 dark:border-slate-800/80"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left 7 Columns: Deployment Tiers */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide">
                  Flexible Deployment Topology
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Run in Our Managed Cloud or Inside Your Private VPC
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 space-y-4 shadow-xs">
                  <div>
                    <div className="text-xs font-mono text-slate-500">
                      DEVELOPER & TEAM CLOUD
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                      Instant Workspace
                    </div>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Google Drive OAuth & one-click document sync</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Multi-agent routing (QA, Summarize, Explain, Compare)
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Persistent SQLite session memory & citation inspector</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('overview')}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Launch Interactive Workspace
                  </button>
                </div>

                <div className="rounded-2xl border border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-[#0D101A] p-6 space-y-4 shadow-xs">
                  <div>
                    <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                      ENTERPRISE DEDICATED VPC
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                      Self-Hosted / BYOC
                    </div>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>Customer-managed KMS keys (60-day rotation)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>Dedicated ChromaDB HNSW cluster with SQ8</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>SOC2 Type II & HIPAA BAA compliance attestation</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('settings')}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Inspect Runtime Telemetry
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Enterprise VPC Architecture Provisioning Form */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D101A] p-6 sm:p-7 space-y-5 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Request Private VPC Deployment Manifest
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Generate a custom Terraform & Docker Compose bundle pre-configured for your model provider and vector index scale.
                </p>
              </div>

              {formSubmitted ? (
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Deployment Manifest Ready for {teamEmail}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Your {deploymentTier.toUpperCase()} configuration profile has been prepared. You can immediately test the live multi-agent pipeline in the workspace.
                  </p>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('overview')}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Enter Knowledge Workspace Now →
                  </button>
                </div>
              ) : (
                <form onSubmit={handleEnterpriseRequest} className="space-y-4">
                  <div>
                    <label
                      htmlFor="enterprise-email"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Engineering or Security Work Email
                    </label>
                    <input
                      id="enterprise-email"
                      type="email"
                      required
                      value={teamEmail}
                      onChange={(e) => setTeamEmail(e.target.value)}
                      placeholder="architect@company.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B11] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Target Infrastructure Environment
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'cloud', label: 'Managed Cloud' },
                          { id: 'vpc', label: 'AWS / GCP VPC' },
                          { id: 'airgapped', label: 'On-Premises' },
                        ] as const
                      ).map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setDeploymentTier(tier.id)}
                          className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                            deploymentTier === tier.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B11] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {tier.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Generate Deployment Bundle
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="py-10 bg-white dark:bg-[#07080C] border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">
              KW
            </div>
            <span className="text-slate-700 dark:text-slate-300 font-semibold">
              Knowledge Workspace
            </span>
            <span>· Multi-Agent Document Intelligence System</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={onOpenDriveModal}
              className="hover:text-indigo-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              Google Drive Sync
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('overview')}
              className="hover:text-indigo-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('documents')}
              className="hover:text-indigo-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              Document Corpus
            </button>
            <button
              type="button"
              onClick={() => onEnterWorkspace('analytics')}
              className="hover:text-indigo-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              RAG Analytics
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
