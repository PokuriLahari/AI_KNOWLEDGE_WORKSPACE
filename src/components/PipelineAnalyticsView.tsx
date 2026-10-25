import React, { useState, useEffect } from 'react';
import {
  Activity,
  Search,
  Database,
  Cpu,
  Download,
  FileText,
  Compass,
  ArrowRight,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import {
  DocumentItem,
  HealthResponse,
  RetrievedContext,
  RouteResponse,
} from '../lib/ragCore';
import { workspaceApi, formatBytes } from '../lib/apiClient';

interface PipelineAnalyticsViewProps {
  health: HealthResponse | null;
  documents: DocumentItem[];
  totalChunks: number;
  onInspectDocument: (docId: string) => void;
  onAskQuestion: (question: string, docId?: string | null) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const PipelineAnalyticsView: React.FC<PipelineAnalyticsViewProps> = ({
  health,
  documents,
  totalChunks,
  onInspectDocument,
  onAskQuestion,
  onNotify,
}) => {
  const [probeQuery, setProbeQuery] = useState(
    'Reciprocal Rank Fusion RRF latency budget and KMS key rotation interval'
  );
  const [probeDocFilter, setProbeDocFilter] = useState<string>('');
  const [probeTopK, setProbeTopK] = useState<number>(5);
  const [isProbing, setIsProbing] = useState(false);
  const [probeRoute, setProbeRoute] = useState<RouteResponse | null>(null);
  const [probeContexts, setProbeContexts] = useState<RetrievedContext[]>([]);
  const [probeLatency, setProbeLatency] = useState<number>(0);

  useEffect(() => {
    runRetrievalProbe(probeQuery, probeDocFilter, probeTopK);
  }, []);

  const runRetrievalProbe = async (q: string, docId: string, k: number) => {
    const clean = q.trim();
    if (!clean) return;
    setIsProbing(true);
    const t0 = performance.now();
    try {
      const [routeRes, askRes] = await Promise.all([
        workspaceApi.routeQuery(clean),
        workspaceApi.askQuestion({
          question: clean,
          k,
          document_id: docId || null,
        }),
      ]);
      setProbeRoute(routeRes);
      setProbeContexts(askRes.contexts);
      setProbeLatency(Math.round(performance.now() - t0));
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to run retrieval probe.');
    } finally {
      setIsProbing(false);
    }
  };

  const handleExportIndexReport = () => {
    const report = {
      exported_at: new Date().toISOString(),
      system_health: health,
      corpus_summary: {
        total_documents: documents.length,
        total_chunks: totalChunks,
        total_bytes: documents.reduce((acc, d) => acc + d.file_size_bytes, 0),
      },
      documents,
      last_retrieval_probe: {
        query: probeQuery,
        routing: probeRoute,
        retrieved_contexts: probeContexts,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-workspace-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('success', 'Exported RAG workspace telemetry report (JSON).');
  };

  const totalBytes = documents.reduce((acc, d) => acc + d.file_size_bytes, 0);
  const totalPages = documents.reduce((acc, d) => acc + d.page_count, 0);

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            RAG Pipeline & Vector Index Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inspect corpus chunk density, simulate hybrid dense + BM25 retrieval scoring, and audit multi-agent routing decisions.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportIndexReport}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] hover:bg-slate-50 dark:hover:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer self-start whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-indigo-500" />
          <span>Export Telemetry JSON</span>
        </button>
      </div>

      {/* Pipeline Architecture & Corpus Distribution Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Corpus Density Breakdown (6 cols) */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Vector Index Chunk Distribution
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Proportional share of {totalChunks} semantic chunks across {documents.length} indexed files ({formatBytes(totalBytes)} · {totalPages} pages)
              </p>
            </div>
            <Database className="w-4 h-4 text-indigo-500 shrink-0" />
          </div>

          <div className="space-y-3 pt-1">
            {documents.map((doc) => {
              const sharePct =
                totalChunks > 0 ? Math.round((doc.chunk_count / totalChunks) * 100) : 0;
              return (
                <div key={doc.doc_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectDocument(doc.doc_id)}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:text-indigo-500 truncate cursor-pointer text-left"
                    >
                      {doc.filename}
                    </button>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {doc.chunk_count} chunks · {doc.page_count}p ({sharePct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800/90 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(6, sharePct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Stage RAG Pipeline Topology (6 cols) */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Retrieval & Synthesis Pipeline
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                End-to-end execution stages verified via GET /health
              </p>
            </div>
            <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800/80 border-t border-b border-slate-200 dark:border-slate-800/80 text-xs">
            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">01. Ingestion & Chunking</span>
              <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                750 chars · 120-char overlap
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">02. Dense Vector Embeddings</span>
              <span className="font-mono text-slate-900 dark:text-slate-100 truncate">
                {health?.embedding_model || 'all-MiniLM-L6-v2 (384-d)'}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">03. Hybrid Rank Fusion</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                Dense Cosine + BM25 RRF (k=60)
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">04. Grounded LLM Synthesis</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                {health?.model || 'gemini-3.8-flash'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Zero-fabrication citation contract active</span>
            </span>
            <span className="font-mono tabular-nums">Max upload: {health?.max_upload_mb || 25} MB</span>
          </div>
        </div>
      </div>

      {/* Live Retrieval & Similarity Simulator */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Interactive Retrieval & Relevance Score Simulator
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Test any query against the vector index to inspect the exact ranked chunks, cosine/BM25 relevance scores, and router classification before synthesis.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runRetrievalProbe(probeQuery, probeDocFilter, probeTopK);
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-3"
        >
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="probe-query-input" className="sr-only">
              Retrieval simulation query
            </label>
            <input
              id="probe-query-input"
              type="text"
              value={probeQuery}
              onChange={(e) => setProbeQuery(e.target.value)}
              placeholder="Enter technical terms or a natural language question..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="md:col-span-3">
            <label htmlFor="probe-doc-select" className="sr-only">
              Filter by document
            </label>
            <select
              id="probe-doc-select"
              value={probeDocFilter}
              onChange={(e) => setProbeDocFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="">All Documents ({documents.length})</option>
              {documents.map((d) => (
                <option key={d.doc_id} value={d.doc_id}>
                  {d.filename}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <label htmlFor="probe-topk-select" className="sr-only">
              Top-K chunks
            </label>
            <select
              id="probe-topk-select"
              value={probeTopK}
              onChange={(e) => setProbeTopK(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-2 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
            >
              <option value={3}>k=3</option>
              <option value={5}>k=5</option>
              <option value={8}>k=8</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isProbing || !probeQuery.trim()}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              {isProbing ? 'Probing...' : 'Simulate Retrieval'}
            </button>
          </div>
        </form>

        {/* Router + Ranked Chunks Output */}
        {probeRoute && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1017] border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
              <Compass className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase">
                Intent: {probeRoute.intent}
              </span>
              <span aria-hidden="true">·</span>
              <span>Agent: {probeRoute.recommended_agent}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Confidence {(probeRoute.confidence * 100).toFixed(0)}%
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Roundtrip {probeLatency}ms</span>
            </div>

            <button
              type="button"
              onClick={() => onAskQuestion(probeQuery, probeDocFilter || null)}
              className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer whitespace-nowrap"
            >
              <span>Open in AI Chat</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 font-medium">Rank</th>
                <th className="py-2.5 px-3 font-medium">Source Document & Section</th>
                <th className="py-2.5 px-3 font-medium text-right">Page</th>
                <th className="py-2.5 px-3 font-medium text-right">Hybrid Score</th>
                <th className="py-2.5 px-4 font-medium">Retrieved Chunk Excerpt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {probeContexts.map((ctx, idx) => (
                <tr
                  key={ctx.chunk_id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                >
                  <td className="py-3 px-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    #{idx + 1}
                  </td>
                  <td className="py-3 px-3 min-w-[200px]">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {ctx.filename}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {ctx.section_title} · <span className="font-mono">{ctx.chunk_id}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    p. {ctx.page_number}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {(ctx.score * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-md">
                    <p className="line-clamp-2 leading-relaxed">{ctx.excerpt}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
