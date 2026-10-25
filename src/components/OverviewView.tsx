import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  Upload,
  FileText,
  ArrowRight,
  MessageSquare,
  Layers,
  GitCompare,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  FolderOpen,
  Compass,
  FolderGit2,
  ShieldAlert,
  Network,
  GraduationCap,
  BarChart3,
  Mic,
} from 'lucide-react';
import {
  DocumentItem,
  HealthResponse,
  ConversationSession,
  RouteResponse,
  validateUploadFile,
} from '../lib/ragCore';
import { workspaceApi, formatBytes, formatRelativeTime } from '../lib/apiClient';

interface OverviewViewProps {
  health: HealthResponse | null;
  documents: DocumentItem[];
  totalChunks: number;
  sessions: ConversationSession[];
  isLoading: boolean;
  onNavigate: (
    view:
      | 'overview'
      | 'documents'
      | 'assistant'
      | 'summaries'
      | 'compare'
      | 'radar'
      | 'graph'
      | 'study'
      | 'extractor'
      | 'podcast'
  ) => void;
  onAskQuestion: (question: string, docId?: string | null) => void;
  onSelectSession: (sessionId: string) => void;
  onInspectDocument: (docId: string) => void;
  onDocumentUploaded: () => Promise<void>;
  onQuickSummarize: (docId: string) => void;
  onQuickExplain: (concept: string) => void;
  onOpenDriveModal?: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  health,
  documents,
  totalChunks,
  sessions,
  isLoading,
  onNavigate,
  onAskQuestion,
  onSelectSession,
  onInspectDocument,
  onDocumentUploaded,
  onQuickSummarize,
  onQuickExplain,
  onOpenDriveModal,
  onNotify,
}) => {
  const [composerQuery, setComposerQuery] = useState('');
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>('');
  const [liveRoute, setLiveRoute] = useState<RouteResponse | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Debounced live intent routing preview via POST /route
  useEffect(() => {
    const trimmed = composerQuery.trim();
    if (trimmed.length < 4) {
      setLiveRoute(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsRouting(true);
      try {
        const routeRes = await workspaceApi.routeQuery(trimmed, controller.signal);
        setLiveRoute(routeRes);
      } catch {
        // Ignore abort errors
      } finally {
        setIsRouting(false);
      }
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [composerQuery]);

  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = composerQuery.trim();
    if (!q) return;
    onAskQuestion(q, selectedDocFilter || null);
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const check = validateUploadFile(file.name, file.size);
    if (!check.valid) {
      onNotify('error', check.error || 'Unsupported file');
      return;
    }

    try {
      setUploadingFile(file.name);
      setUploadProgress(15);
      const res = await workspaceApi.uploadDocument(file, (pct) => setUploadProgress(pct));
      await onDocumentUploaded();
      onNotify('success', res.message);
    } catch (err: any) {
      onNotify('error', err?.message || 'Document upload failed.');
    } finally {
      setUploadingFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalPages = documents.reduce((acc, doc) => acc + doc.page_count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8"
    >
      {/* Section 1: Welcome Header & Primary "Ask Your Documents Anything" Composer */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              Multi-Agent Document Intelligence System
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Knowledge Workspace Overview
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{health?.vector_store || 'ChromaDB (HNSW)'}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{totalChunks} chunks</span>
          </div>
        </div>

        {/* Dominant Focal Anchor: Ask Your Documents Anything Composer */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-4 sm:p-5 shadow-xs">
          <form onSubmit={handleComposerSubmit} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="overview-ask-input"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2"
              >
                <Search className="w-3.5 h-3.5 text-indigo-500" />
                <span>Ask your documents anything</span>
              </label>

              <div className="flex items-center gap-2">
                <label htmlFor="overview-doc-scope" className="sr-only">
                  Document Scope
                </label>
                <select
                  id="overview-doc-scope"
                  value={selectedDocFilter}
                  onChange={(e) => setSelectedDocFilter(e.target.value)}
                  className="text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="">All indexed documents ({documents.length})</option>
                  {documents.map((d) => (
                    <option key={d.doc_id} value={d.doc_id}>
                      {d.filename}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="overview-ask-input"
                type="text"
                value={composerQuery}
                onChange={(e) => setComposerQuery(e.target.value)}
                placeholder="Ask a technical question, request a section summary, or compare specifications across files..."
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0D13] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                type="submit"
                disabled={!composerQuery.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] border border-[#C7D2FE] disabled:opacity-45 text-[#312E81] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Run Query</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Live Intent Router feedback bar or Quick Sample Prompts */}
            {liveRoute ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Router Intent: {liveRoute.intent.toUpperCase()}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Agent: {liveRoute.recommended_agent}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Confidence {(liveRoute.confidence * 100).toFixed(0)}%
                  </span>
                  {liveRoute.explanation_style && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Style: {liveRoute.explanation_style}</span>
                    </>
                  )}
                </div>
                {isRouting && <span className="text-[11px] text-slate-400">Classifying...</span>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-slate-400 dark:text-slate-500">Suggested queries:</span>
                <button
                  type="button"
                  onClick={() =>
                    onAskQuestion(
                      'What is the p95 latency budget for the cross-encoder reranker and how does RRF work?'
                    )
                  }
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-4 hover:underline transition-colors cursor-pointer"
                >
                  RRF & p95 reranking latency
                </button>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onAskQuestion(
                      'What KMS key rotation interval and audit log retention period are mandated under SOC2 Type II?'
                    )
                  }
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-4 hover:underline transition-colors cursor-pointer"
                >
                  SOC2 KMS key rotation & retention
                </button>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onAskQuestion(
                      'How much RAM does ChromaDB HNSW require per 1M chunks with SQ8 quantization?'
                    )
                  }
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-4 hover:underline transition-colors cursor-pointer"
                >
                  ChromaDB SQ8 memory footprint
                </button>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* Section 2: Genuine Workspace Telemetry Strip */}
      <section aria-label="Workspace Index Metrics">
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Indexed Documents</div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {isLoading ? '—' : documents.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Across {totalPages} extracted pages
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Indexed Chunks</div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {isLoading ? '—' : totalChunks}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              750-char window · 120-char overlap
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Embedding & Retrieval</div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate pt-1">
              Hybrid Dense + BM25
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {health?.embedding_model || 'all-MiniLM-L6-v2'}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Conversation Sessions</div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {isLoading ? '—' : sessions.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              SQLite session memory active
            </div>
          </div>
        </div>
      </section>

      {/* Section 2B: 5 Unique Document Intelligence Modules */}
      <section aria-label="Unique Document Intelligence Suite" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Unique Document Intelligence Suite (5 Interactive Tools)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cross-document conflict auditing, visual concept mapping, flashcards & exams, benchmark chart extraction, and two-host audio podcasts
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('radar')}
            className="rounded-xl border border-[#FECDD3] bg-[#FFF5F6] hover:bg-[#FFE4E6] dark:bg-rose-950/25 dark:border-rose-800/50 p-4 text-left space-y-1.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#9F1239] dark:text-rose-300">
              <span className="text-xs font-semibold">Contradiction Radar</span>
              <ShieldAlert className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Auto-detect cross-document SLA & policy conflicts with citations
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('graph')}
            className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] hover:bg-[#E0E7FF] dark:bg-indigo-950/25 dark:border-indigo-800/50 p-4 text-left space-y-1.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#312E81] dark:text-indigo-300">
              <span className="text-xs font-semibold">Knowledge Graph</span>
              <Network className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Interactive SVG node map linking documents, concepts & SLAs
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('study')}
            className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] hover:bg-[#EDE9FE] dark:bg-violet-950/25 dark:border-violet-800/50 p-4 text-left space-y-1.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#4C1D95] dark:text-violet-300">
              <span className="text-xs font-semibold">Study & Quiz Mode</span>
              <GraduationCap className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Interactive flip flashcards & grounded multiple-choice exam
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('extractor')}
            className="rounded-xl border border-[#A7F3D0] bg-[#F0FDF4] hover:bg-[#D1FAE5] dark:bg-emerald-950/25 dark:border-emerald-800/50 p-4 text-left space-y-1.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#065F46] dark:text-emerald-300">
              <span className="text-xs font-semibold">Table & Chart Extractor</span>
              <BarChart3 className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Visual benchmark comparison bars & 1-click CSV export
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('podcast')}
            className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] hover:bg-[#FEF3C7] dark:bg-amber-950/25 dark:border-amber-800/50 p-4 text-left space-y-1.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#92400E] dark:text-amber-300">
              <span className="text-xs font-semibold">AI Podcast Studio</span>
              <Mic className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Two-host conversational deep dive with live audio player
            </p>
          </button>
        </div>
      </section>

      {/* Section 3: Quick Specialized Workflows + Upload Dropzone */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Specialized AI Workflows (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Specialized Multi-Agent Workflows
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Launch dedicated synthesis, pedagogical explanation, or cross-document conflict analysis pipelines.
            </p>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800/80 border-t border-b border-slate-200 dark:border-slate-800/80">
            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>Document Summarization</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Generate executive briefs, section breakdowns, or query-focused digests with chunk coverage metrics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('summaries')}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Summarizer
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>Concept Explanation</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Deconstruct technical concepts in Technical, Executive, Step-by-Step, or Plain-Language styles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onQuickExplain('Reciprocal Rank Fusion (RRF)')}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Explain Concept
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <GitCompare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>Cross-Document Comparison</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Detect policy conflicts, SLA differences, and missing topics across any two indexed documents.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('compare')}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Compare Docs
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>All workflows enforce strict chunk-level citation grounding</span>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer whitespace-nowrap"
            >
              Launch Full Chat Workspace →
            </button>
          </div>
        </div>

        {/* Direct Document Dropzone (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Quick Document Ingestion
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Index new files directly into ChromaDB & SQLite (`POST /index`)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer whitespace-nowrap"
            >
              Library ({documents.length})
            </button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFilesSelected(e.dataTransfer.files);
            }}
            className={`flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-300 dark:border-slate-700/80 bg-slate-50/50 dark:bg-[#0B0D13]/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              id="overview-file-upload"
              accept=".pdf,.docx,.pptx,.txt,.csv"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="sr-only"
            />
            <Upload className="w-6 h-6 text-indigo-500 dark:text-indigo-400 mb-2" />
            {uploadingFile ? (
              <div className="w-full max-w-xs space-y-2">
                <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                  Indexing {uploadingFile}...
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {uploadProgress}% complete
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Drag and drop a document here, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    browse files
                  </button>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  PDF · DOCX · PPTX · TXT · CSV · Max {health?.max_upload_mb || 25} MB
                </p>
                {onOpenDriveModal && (
                  <button
                    type="button"
                    onClick={onOpenDriveModal}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/90 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <FolderGit2 className="w-3.5 h-3.5" />
                    <span>Import from Google Drive</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Section 4: Recent Documents & Recent Conversations */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Indexed Documents Table (8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Indexed Knowledge Corpus
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active documents available for semantic search and multi-agent workflows
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
            >
              Manage Documents →
            </button>
          </div>

          {documents.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <FolderOpen className="w-7 h-7 text-slate-400 mx-auto" />
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No documents indexed yet
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Upload a PDF, DOCX, PPTX, TXT, or CSV file above to populate the vector store.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
                    <th className="py-2.5 px-4 font-medium">Document</th>
                    <th className="py-2.5 px-3 font-medium text-right">Size</th>
                    <th className="py-2.5 px-3 font-medium text-right">Pages</th>
                    <th className="py-2.5 px-3 font-medium text-right">Chunks</th>
                    <th className="py-2.5 px-4 font-medium text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                  {documents.slice(0, 5).map((doc) => (
                    <tr
                      key={doc.doc_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onInspectDocument(doc.doc_id)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {doc.filename}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span className="uppercase font-mono">{doc.file_type}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelativeTime(doc.indexed_at)}</span>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatBytes(doc.file_size_bytes)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {doc.page_count}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-200 font-medium">
                        {doc.chunk_count}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onInspectDocument(doc.doc_id)}
                            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                          >
                            Inspect
                          </button>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => onQuickSummarize(doc.doc_id)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            Summarize
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Conversations Panel (4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Recent Conversations
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Persisted multi-turn RAG sessions
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('assistant')}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                New Chat →
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <MessageSquare className="w-6 h-6 text-slate-400 mx-auto" />
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  No active conversations
                </div>
                <p className="text-[11px] text-slate-500">
                  Ask a question above to start a grounded session.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800/70">
                {sessions.slice(0, 4).map((sess) => (
                  <button
                    key={sess.session_id}
                    type="button"
                    onClick={() => onSelectSession(sess.session_id)}
                    className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {sess.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatRelativeTime(sess.updated_at)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{sess.message_count} msgs</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-slate-50/60 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Session Memory: SQLite Registry</span>
            <span className="font-mono tabular-nums">{sessions.length} active</span>
          </div>
        </div>
      </section>
    </motion.div>
  );
};
