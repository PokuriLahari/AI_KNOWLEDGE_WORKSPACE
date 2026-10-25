import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Clock,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { DocumentItem, CompareResponse } from '../lib/ragCore';
import { workspaceApi } from '../lib/apiClient';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceEvidenceAccordion } from './SourceEvidenceAccordion';

interface CompareDocumentsViewProps {
  documents: DocumentItem[];
  onInspectDocument: (docId: string) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const TOPIC_PRESETS = [
  'Cryptographic key rotation intervals, log retention windows, and tenant isolation',
  'Retrieval latency budgets, embedding models, and vector memory overhead',
  'SOC2 compliance controls, PII redaction, and operational SLAs',
];

export const CompareDocumentsView: React.FC<CompareDocumentsViewProps> = ({
  documents,
  onInspectDocument,
  onNotify,
}) => {
  const defaultDoc1 =
    documents.find((d) => d.doc_id === 'doc_arch_rag_v4')?.doc_id || documents[0]?.doc_id || '';
  const defaultDoc2 =
    documents.find((d) => d.doc_id === 'doc_sec_audit_q3')?.doc_id ||
    documents[1]?.doc_id ||
    documents[0]?.doc_id ||
    '';

  const [docId1, setDocId1] = useState<string>(defaultDoc1);
  const [docId2, setDocId2] = useState<string>(defaultDoc2);
  const [topic, setTopic] = useState<string>(TOPIC_PRESETS[0]);
  const [isComparing, setIsComparing] = useState(false);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);

  useEffect(() => {
    if (!docId1 && documents.length > 0) setDocId1(defaultDoc1);
    if (!docId2 && documents.length > 1) setDocId2(defaultDoc2);
  }, [documents, defaultDoc1, defaultDoc2]);

  // Run initial comparison automatically when at least 2 documents exist
  useEffect(() => {
    if (documents.length >= 2 && !comparison && !isComparing) {
      executeComparison(defaultDoc1, defaultDoc2, TOPIC_PRESETS[0]);
    }
  }, [documents]);

  const executeComparison = async (id1: string, id2: string, compareTopic: string) => {
    if (!id1 || !id2) {
      onNotify('error', 'Select two indexed documents to compare.');
      return;
    }
    const cleanTopic = compareTopic.trim() || TOPIC_PRESETS[0];
    setIsComparing(true);
    try {
      const res = await workspaceApi.compareDocuments({
        doc_id_1: id1,
        doc_id_2: id2,
        topic: cleanTopic,
        k: 4,
      });
      setComparison(res);
    } catch (err: any) {
      onNotify('error', err?.message || 'Document comparison failed.');
    } finally {
      setIsComparing(false);
    }
  };

  const handleSwapDocs = () => {
    const temp = docId1;
    setDocId1(docId2);
    setDocId2(temp);
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Cross-Document Comparison & Conflict Analysis
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select two indexed documents and a comparison topic (`POST /compare`) to surface aligned controls, structural differences, policy conflicts, and missing coverage.
        </p>
      </div>

      {/* Configuration Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          executeComparison(docId1, docId2, topic);
        }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label
              htmlFor="compare-doc-1"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Document A (Baseline Source)
            </label>
            <select
              id="compare-doc-1"
              value={docId1}
              onChange={(e) => setDocId1(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {documents.map((doc) => (
                <option key={doc.doc_id} value={doc.doc_id}>
                  {doc.filename} ({doc.chunk_count} chunks)
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1 flex justify-center pb-0.5">
            <button
              type="button"
              onClick={handleSwapDocs}
              aria-label="Swap Document A and Document B"
              title="Swap documents"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          <div className="md:col-span-5 space-y-1.5">
            <label
              htmlFor="compare-doc-2"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Document B (Comparison Target)
            </label>
            <select
              id="compare-doc-2"
              value={docId2}
              onChange={(e) => setDocId2(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {documents.map((doc) => (
                <option key={doc.doc_id} value={doc.doc_id}>
                  {doc.filename} ({doc.chunk_count} chunks)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="compare-topic-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Comparison Topic or Audit Dimension
            </label>
            <input
              id="compare-topic-input"
              type="text"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a topic, policy area, or technical specification to compare..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <button
            type="submit"
            disabled={isComparing || !docId1 || !docId2}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>{isComparing ? 'Comparing Documents...' : 'Run Comparison'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Topic presets:</span>
          {TOPIC_PRESETS.map((preset, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setTopic(preset);
                  executeComparison(docId1, docId2, preset);
                }}
                className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left"
              >
                {preset}
              </button>
            </React.Fragment>
          ))}
        </div>
      </form>

      {/* Comparison Results */}
      {isComparing ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-8 space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <Clock className="w-4 h-4 animate-spin" />
            <span>Cross-referencing retrieved chunks and detecting conflicts via POST /compare...</span>
          </div>
          <div className="space-y-2.5">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-4/5" />
          </div>
        </div>
      ) : comparison ? (
        <div className="space-y-6">
          {/* Coverage & Executive Synthesis Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              {/* Document 1 Coverage */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Doc A: {comparison.doc_1.filename}
                  </span>
                  <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">
                    {comparison.doc_1.coverage_pct}% chunk coverage
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${comparison.doc_1.coverage_pct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {comparison.doc_1.chunks_retrieved} of {comparison.doc_1.total_chunks} chunks retrieved · Pages referenced: {comparison.doc_1.pages_referenced.join(', ') || '1'}
                </div>
              </div>

              {/* Document 2 Coverage */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Doc B: {comparison.doc_2.filename}
                  </span>
                  <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">
                    {comparison.doc_2.coverage_pct}% chunk coverage
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${comparison.doc_2.coverage_pct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {comparison.doc_2.chunks_retrieved} of {comparison.doc_2.total_chunks} chunks retrieved · Pages referenced: {comparison.doc_2.pages_referenced.join(', ') || '1'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  Executive Comparative Synthesis
                </h2>
                <span className="font-mono tabular-nums text-slate-500">
                  {comparison.latency_ms}ms
                </span>
              </div>
              <MarkdownRenderer content={comparison.executive_synthesis} />
            </div>
          </div>

          {/* Reported Policy & Specification Conflicts */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Reported Conflicts & Divergent Thresholds ({comparison.conflicts.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Requires architectural or compliance reconciliation
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {comparison.conflicts.map((conflict, idx) => (
                <div key={idx} className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {conflict.dimension}
                    </span>
                    <span
                      className={`text-xs font-mono font-semibold uppercase ${
                        conflict.severity === 'high'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      Severity: {conflict.severity}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D1017] space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {comparison.doc_1.filename}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {conflict.doc_1_position}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D1017] space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {comparison.doc_2.filename}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {conflict.doc_2_position}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Similarities & Differences */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Shared Controls & Similarities
                </h2>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4 leading-relaxed">
                {comparison.similarities.map((sim, i) => (
                  <li key={i}>{sim}</li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Structural & Scope Differences
              </h2>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {comparison.differences.map((diff, i) => (
                  <div key={i} className="py-3 first:pt-0 last:pb-0 space-y-2 text-xs">
                    <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {diff.aspect}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-slate-100">Doc A: </strong>
                        {diff.doc_1_detail}
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-slate-100">Doc B: </strong>
                        {diff.doc_2_detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Missing Topics / Coverage Gaps */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Missing Topics & Asymmetric Coverage
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D1017] space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Omitted in {comparison.doc_1.filename} (Present in Doc B)
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                  {comparison.missing_topics.missing_in_doc_1.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D1017] space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Omitted in {comparison.doc_2.filename} (Present in Doc A)
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                  {comparison.missing_topics.missing_in_doc_2.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Side-by-Side Source Evidence Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-4">
              <SourceEvidenceAccordion
                contexts={comparison.evidence_doc_1}
                title={`Doc A Evidence: ${comparison.doc_1.filename}`}
                defaultOpen={true}
                onInspectDocument={onInspectDocument}
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-4">
              <SourceEvidenceAccordion
                contexts={comparison.evidence_doc_2}
                title={`Doc B Evidence: ${comparison.doc_2.filename}`}
                defaultOpen={true}
                onInspectDocument={onInspectDocument}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
