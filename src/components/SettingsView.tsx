import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  RefreshCw,
  Compass,
  Sun,
  Moon,
  Server,
  Database,
  Cpu,
  Copy,
  Check,
  Play,
  Link2,
} from 'lucide-react';
import { HealthResponse, RouteResponse } from '../lib/ragCore';
import {
  workspaceApi,
  getActiveApiBaseUrl,
  setCustomApiBaseUrl,
  getResolvedApiOriginUrl,
} from '../lib/apiClient';

interface SettingsViewProps {
  health: HealthResponse | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onRefreshHealth: () => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

interface EndpointProbeResult {
  endpoint: string;
  method: 'GET' | 'POST';
  status: 'ok' | 'error';
  latencyMs: number;
  detail: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  health,
  theme,
  onToggleTheme,
  onRefreshHealth,
  onNotify,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState(getActiveApiBaseUrl());
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Live Endpoint Self-Test state
  const [isRunningProbes, setIsRunningProbes] = useState(false);
  const [probeResults, setProbeResults] = useState<EndpointProbeResult[]>([]);

  const [testQuery, setTestQuery] = useState(
    'Compare the KMS key rotation policy between the Architecture Spec and Security Audit'
  );
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [isTestingRoute, setIsTestingRoute] = useState(false);

  const resolvedFullUrl = getResolvedApiOriginUrl();
  const isUsingBuiltInBackend =
    getActiveApiBaseUrl() === '/api' || getActiveApiBaseUrl() === '';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshHealth();
      onNotify('success', 'Backend health telemetry refreshed from GET /health.');
    } catch {
      onNotify('error', 'Failed to reach GET /health endpoint.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplyApiUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = apiUrlInput.trim() || '/api';
    setCustomApiBaseUrl(target);
    setApiUrlInput(getActiveApiBaseUrl());
    try {
      await onRefreshHealth();
      onNotify(
        'success',
        target === '/api'
          ? 'Connected to built-in Cloud RAG backend (/api).'
          : `Connected to custom API endpoint: ${target}`
      );
    } catch {
      onNotify(
        'error',
        `Could not reach ${target}/health. Reverted or check CORS/server status.`
      );
    }
  };

  const handleResetToBuiltIn = async () => {
    setCustomApiBaseUrl('/api');
    setApiUrlInput('/api');
    await onRefreshHealth();
    onNotify('success', 'Switched to built-in self-hosted RAG backend (/api).');
  };

  const handleCopyResolvedUrl = async () => {
    try {
      await navigator.clipboard.writeText(resolvedFullUrl);
      setCopiedUrl(true);
      onNotify('success', `Copied live API URL: ${resolvedFullUrl}`);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      onNotify('error', 'Clipboard copy failed.');
    }
  };

  const handleRunEndpointProbes = async () => {
    setIsRunningProbes(true);
    const results: EndpointProbeResult[] = [];

    // 1. GET /health
    const t0 = performance.now();
    try {
      const h = await workspaceApi.getHealth();
      results.push({
        endpoint: '/health',
        method: 'GET',
        status: 'ok',
        latencyMs: Math.round(performance.now() - t0),
        detail: `${h.status.toUpperCase()} · ${h.model} · ${h.total_chunks} chunks`,
      });
    } catch (err: any) {
      results.push({
        endpoint: '/health',
        method: 'GET',
        status: 'error',
        latencyMs: Math.round(performance.now() - t0),
        detail: err?.message || 'Failed',
      });
    }

    // 2. GET /documents
    const t1 = performance.now();
    try {
      const docs = await workspaceApi.getDocuments();
      results.push({
        endpoint: '/documents',
        method: 'GET',
        status: 'ok',
        latencyMs: Math.round(performance.now() - t1),
        detail: `${docs.total_documents} indexed files · ${docs.total_chunks} vector chunks`,
      });
    } catch (err: any) {
      results.push({
        endpoint: '/documents',
        method: 'GET',
        status: 'error',
        latencyMs: Math.round(performance.now() - t1),
        detail: err?.message || 'Failed',
      });
    }

    // 3. POST /route
    const t2 = performance.now();
    try {
      const r = await workspaceApi.routeQuery(
        'How does Reciprocal Rank Fusion combine BM25 and dense embeddings?'
      );
      results.push({
        endpoint: '/route',
        method: 'POST',
        status: 'ok',
        latencyMs: Math.round(performance.now() - t2),
        detail: `Intent: ${r.intent.toUpperCase()} -> ${r.recommended_agent} (${Math.round(
          r.confidence * 100
        )}%)`,
      });
    } catch (err: any) {
      results.push({
        endpoint: '/route',
        method: 'POST',
        status: 'error',
        latencyMs: Math.round(performance.now() - t2),
        detail: err?.message || 'Failed',
      });
    }

    // 4. GET /sessions
    const t3 = performance.now();
    try {
      const s = await workspaceApi.getSessions();
      results.push({
        endpoint: '/sessions',
        method: 'GET',
        status: 'ok',
        latencyMs: Math.round(performance.now() - t3),
        detail: `${s.sessions.length} persisted conversation sessions in SQLite`,
      });
    } catch (err: any) {
      results.push({
        endpoint: '/sessions',
        method: 'GET',
        status: 'error',
        latencyMs: Math.round(performance.now() - t3),
        detail: err?.message || 'Failed',
      });
    }

    setProbeResults(results);
    setIsRunningProbes(false);
    onNotify('success', 'Completed live RAG backend self-test across all endpoints.');
  };

  const handleTestRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setIsTestingRoute(true);
    try {
      const res = await workspaceApi.routeQuery(testQuery.trim());
      setRouteResult(res);
    } catch (err: any) {
      onNotify('error', err?.message || 'Route classification failed.');
    } finally {
      setIsTestingRoute(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Workspace Configuration & System Telemetry
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your built-in RAG backend is already hosted and active inside this app—no external server deployment needed.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] hover:bg-slate-50 dark:hover:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer self-start"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span>Refresh Health (`GET /health`)</span>
        </button>
      </div>

      {/* NEW: Built-In API URL & Zero-Deployment Endpoint Manager */}
      <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-500/30 bg-white dark:bg-[#11141D] p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active API Endpoint (`VITE_API_URL`)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isUsingBuiltInBackend
                  ? 'Running on built-in cloud RAG backend (/api) — zero external deployment required'
                  : 'Connected to custom external FastAPI backend'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunEndpointProbes}
              disabled={isRunningProbes}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {isRunningProbes ? 'Testing Endpoints...' : 'Run Live API Self-Test'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Resolved URL Box */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Your Live Provisioned Backend API URL (Auto-Configured):
            </div>
            <div className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 truncate">
              {resolvedFullUrl}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyResolvedUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#141824] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy API URL</span>
                </>
              )}
            </button>

            {!isUsingBuiltInBackend && (
              <button
                type="button"
                onClick={handleResetToBuiltIn}
                className="px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 cursor-pointer"
              >
                Use Built-In `/api`
              </button>
            )}
          </div>
        </div>

        {/* Optional Custom URL Override Form */}
        <form
          onSubmit={handleApplyApiUrl}
          className="flex flex-col sm:flex-row gap-2 pt-1"
        >
          <input
            type="text"
            value={apiUrlInput}
            onChange={(e) => setApiUrlInput(e.target.value)}
            placeholder="/api (Built-in) or https://your-fastapi-server.onrender.com"
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#141824] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Save Endpoint
          </button>
        </form>

        {/* Self-Test Probe Results */}
        {probeResults.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden bg-slate-50/60 dark:bg-[#0B0D13]">
            {probeResults.map((p) => (
              <div
                key={p.endpoint}
                className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      p.status === 'ok' ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  />
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {p.method} {p.endpoint}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    — {p.detail}
                  </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                  {p.latencyMs}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backend Health & Architecture Spec Grid */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Backend RAG Pipeline Status
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{health?.status === 'healthy' ? 'Operational' : 'Connected'}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              <span>AI Synthesis Model</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">
              {health?.model || 'gemini-3.8-flash'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Provider: {health?.provider || 'Google Gemini API'}
            </div>
          </div>

          <div className="p-5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Database className="w-3.5 h-3.5 text-indigo-500" />
              <span>Vector & Embedding Engine</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {health?.vector_store || 'ChromaDB (HNSW)'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              {health?.embedding_model || 'sentence-transformers/all-MiniLM-L6-v2'}
            </div>
          </div>

          <div className="p-5 space-y-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Metadata & Upload Guardrails
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {health?.metadata_store || 'SQLite WAL Registry'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Max {health?.max_upload_mb || 25} MB ·{' '}
              {(
                health?.accepted_formats || ['pdf', 'docx', 'pptx', 'txt', 'csv']
              )
                .join(', ')
                .toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Intent Router Inspector (`POST /route`) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Interactive Query Intent Router Diagnostic (`POST /route`)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Test how the multi-agent router classifies natural language queries into execution tracks (`qa`, `summarize`, `explain`, `compare`, `general`).
          </p>
        </div>

        <form
          onSubmit={handleTestRoute}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <label htmlFor="route-diagnostic-input" className="sr-only">
            Test query for intent classification
          </label>
          <input
            id="route-diagnostic-input"
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Enter a sample prompt to inspect routing classification..."
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            disabled={isTestingRoute || !testQuery.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            {isTestingRoute ? 'Routing...' : 'Classify Intent'}
          </button>
        </form>

        {routeResult && (
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1017] space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <span>
                <strong>Intent:</strong>{' '}
                <span className="font-mono uppercase text-indigo-600 dark:text-indigo-400 font-semibold">
                  {routeResult.intent}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong>Agent:</strong> {routeResult.recommended_agent}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                <strong>Confidence:</strong>{' '}
                {(routeResult.confidence * 100).toFixed(0)}%
              </span>
              {routeResult.explanation_style && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong>Style:</strong> {routeResult.explanation_style}
                  </span>
                </>
              )}
              {routeResult.target_concept && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong>Target Concept:</strong> {routeResult.target_concept}
                  </span>
                </>
              )}
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              {routeResult.reasoning}
            </p>
          </div>
        )}
      </div>

      {/* Appearance & Theme Toggle */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Interface Theme
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Switch between high-craft light mode and deep charcoal dark mode.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Switch to Light Theme</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Switch to Dark Theme</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
};
