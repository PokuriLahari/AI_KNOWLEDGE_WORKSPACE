import React, { useState, useEffect } from 'react';
import {
  Layers,
  BookOpen,
  FileText,
  Clock,
  Copy,
  Check,
  CheckCircle2,
  ArrowRight,
  Volume2,
  Square,
  ListChecks,
  FileEdit,
  Database,
  Download,
  Sparkles,
  MessageCircle,
  Compass,
  Send,
} from 'lucide-react';
import {
  DocumentItem,
  SummaryFormat,
  ExplanationStyle,
  SummarizeResponse,
  ExplainResponse,
  GeminiModelTier,
  DocumentQuickTopic,
  extractDocumentQuickTopics,
} from '../lib/ragCore';
import { workspaceApi } from '../lib/apiClient';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceEvidenceAccordion } from './SourceEvidenceAccordion';

interface SummariesExplainViewProps {
  documents: DocumentItem[];
  initialMode?: 'summarize' | 'explain';
  initialDocId?: string | null;
  initialConcept?: string | null;
  onClearInitial: () => void;
  onInspectDocument: (docId: string) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const SUMMARY_FORMATS: Array<{ value: SummaryFormat; label: string; desc: string }> = [
  {
    value: 'executive_brief',
    label: 'Executive Brief',
    desc: 'High-signal strategic synthesis and operational impact',
  },
  {
    value: 'structured_sections',
    label: 'Structured Sections',
    desc: 'Hierarchical breakdown organized by document headings',
  },
  {
    value: 'bullet_highlights',
    label: 'Bullet Highlights',
    desc: 'Rapid scannable takeaways with explicit page references',
  },
  {
    value: 'technical_deep_dive',
    label: 'Technical Deep Dive',
    desc: 'Dense architectural parameters, tables, and SLAs',
  },
];

const EXPLAIN_STYLES: Array<{ value: ExplanationStyle; label: string; desc: string }> = [
  {
    value: 'technical',
    label: 'Technical Specification',
    desc: 'Rigorous engineering and algorithmic depth',
  },
  {
    value: 'executive',
    label: 'Executive Overview',
    desc: 'Decision-oriented business and governance framing',
  },
  {
    value: 'step_by_step',
    label: 'Step-by-Step Walkthrough',
    desc: 'Sequential execution stages from input to output',
  },
  {
    value: 'eli5',
    label: 'Accessible Plain Language',
    desc: 'Clear, jargon-free explanation with intuitive analogies',
  },
];

const QUICK_CONCEPTS = [
  'Reciprocal Rank Fusion (RRF)',
  'Zero-Trust Tenant Isolation',
  'Scalar Quantization (SQ8) Memory Overhead',
  'SOC2 Type II Control CC7.2 Retention',
];

export const SummariesExplainView: React.FC<SummariesExplainViewProps> = ({
  documents,
  initialMode = 'summarize',
  initialDocId,
  initialConcept,
  onClearInitial,
  onInspectDocument,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'summarize' | 'explain'>(initialMode);

  // Summarization source mode: 'indexed' (select from library) or 'custom' (paste any text)
  const [sourceMode, setSourceMode] = useState<'indexed' | 'custom'>('indexed');
  const [selectedDocId, setSelectedDocId] = useState<string>(
    initialDocId || documents[0]?.doc_id || ''
  );
  const [customTitle, setCustomTitle] = useState<string>('Q4 Product & Security Brief');
  const [customText, setCustomText] = useState<string>('');
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat>('executive_brief');
  const [focusQuery, setFocusQuery] = useState<string>('');
  const [maxChunks, setMaxChunks] = useState<number>(6);
  const [simpleLanguage, setSimpleLanguage] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<GeminiModelTier>('gemini-3.8-flash');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummarizeResponse | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [lastGeneratedTime, setLastGeneratedTime] = useState<string>('');
  const [checkedActions, setCheckedActions] = useState<Record<number, boolean>>({});
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Interactive Document Quick Topics (Sections & Hackathon Teams)
  const [quickTopics, setQuickTopics] = useState<DocumentQuickTopic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string>('overview');

  // Inline Interactive Q&A right inside the Summary card
  const [inlineQuestion, setInlineQuestion] = useState<string>('');
  const [inlineAnswer, setInlineAnswer] = useState<string | null>(null);
  const [inlineFollowUps, setInlineFollowUps] = useState<string[]>([]);
  const [isAskingInline, setIsAskingInline] = useState<boolean>(false);

  // Concept Explanation form state
  const [conceptInput, setConceptInput] = useState<string>(
    initialConcept || 'Reciprocal Rank Fusion (RRF)'
  );
  const [explainStyle, setExplainStyle] = useState<ExplanationStyle>('eli5');
  const [explainDocId, setExplainDocId] = useState<string>('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainResult, setExplainResult] = useState<ExplainResponse | null>(null);
  const [copiedExplain, setCopiedExplain] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      setSelectedDocId(documents[0].doc_id);
    }
  }, [documents, selectedDocId]);

  // Fetch document chunks to populate Interactive Section & Team Quick-Picks
  useEffect(() => {
    if (!selectedDocId || sourceMode !== 'indexed') {
      setQuickTopics([]);
      return;
    }
    let cancelled = false;
    workspaceApi
      .getDocumentDetail(selectedDocId)
      .then((detail) => {
        if (!cancelled) {
          const topics = extractDocumentQuickTopics(detail.chunks || []);
          setQuickTopics(topics);
        }
      })
      .catch(() => {
        if (!cancelled) setQuickTopics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDocId, sourceMode]);

  useEffect(() => {
    if (initialDocId) {
      setActiveTab('summarize');
      setSourceMode('indexed');
      setSelectedDocId(initialDocId);
      setActiveTopicId('overview');
      onClearInitial();
      runSummarize({
        docId: initialDocId,
        format: summaryFormat,
        query: focusQuery,
        chunksLimit: maxChunks,
        mode: 'indexed',
        simple: simpleLanguage,
        model: selectedModel,
        showToast: true,
      });
    } else if (initialConcept) {
      setActiveTab('explain');
      setConceptInput(initialConcept);
      onClearInitial();
      runExplain(initialConcept, explainStyle, explainDocId, true);
    }
  }, [initialDocId, initialConcept]);

  // Run an initial summary automatically on first visit once documents are available (defaulting to Simple Language!)
  useEffect(() => {
    if (documents.length > 0 && !summaryResult && !isSummarizing && !initialConcept) {
      const targetId = initialDocId || documents[0].doc_id;
      setSelectedDocId(targetId);
      runSummarize({
        docId: targetId,
        format: 'executive_brief',
        query: '',
        chunksLimit: 6,
        mode: 'indexed',
        simple: true,
        model: 'gemini-3.8-flash',
        showToast: false,
      });
    }
  }, [documents.length]);

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const activeDisplayedSummary = summaryResult
    ? simpleLanguage && summaryResult.simple_summary
      ? summaryResult.simple_summary
      : !simpleLanguage && summaryResult.technical_summary
      ? summaryResult.technical_summary
      : summaryResult.summary
    : '';

  const activeDisplayedKeyPoints = summaryResult
    ? simpleLanguage && summaryResult.simple_key_points
      ? summaryResult.simple_key_points
      : !simpleLanguage && summaryResult.technical_key_points
      ? summaryResult.technical_key_points
      : summaryResult.key_points || []
    : [];

  const activeDisplayedActionItems = summaryResult
    ? simpleLanguage && summaryResult.simple_action_items
      ? summaryResult.simple_action_items
      : !simpleLanguage && summaryResult.technical_action_items
      ? summaryResult.technical_action_items
      : summaryResult.action_items || []
    : [];

  const toggleAudioBriefing = () => {
    if (!summaryResult) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onNotify('error', 'Audio speech synthesis is not supported in this browser.');
      return;
    }
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    window.speechSynthesis.cancel();
    const cleanSpeechText =
      `${simpleLanguage ? 'Plain-language conversational' : 'Executive'} audio briefing for ${summaryResult.filename}. ` +
      (activeDisplayedKeyPoints.length
        ? `Key takeaways: ${activeDisplayedKeyPoints.join('. ')}. `
        : '') +
      activeDisplayedSummary.replace(/[#*`|>-]/g, ' ').replace(/\s+/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText.slice(0, 1800));
    utterance.rate = 1.03;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleSimpleLanguage = async (nextSimple?: boolean) => {
    const targetSimple = nextSimple !== undefined ? nextSimple : !simpleLanguage;
    stopSpeech();
    setSimpleLanguage(targetSimple);

    if (!summaryResult) return;

    if (targetSimple) {
      setIsSimplifying(true);
      try {
        const simplified = await workspaceApi.simplifySummary({
          filename: summaryResult.filename,
          summary: summaryResult.technical_summary || summaryResult.summary,
          key_points: summaryResult.technical_key_points || summaryResult.key_points,
          action_items: summaryResult.technical_action_items || summaryResult.action_items,
          contexts: summaryResult.contexts,
          format: summaryResult.format,
          query: summaryResult.query,
          model: selectedModel,
        });
        setSummaryResult((prev) =>
          prev
            ? {
                ...prev,
                simple_language: true,
                summary: simplified.simple_summary,
                key_points: simplified.simple_key_points,
                action_items: simplified.simple_action_items,
                simple_summary: simplified.simple_summary,
                simple_key_points: simplified.simple_key_points,
                simple_action_items: simplified.simple_action_items,
                model_used: simplified.model_used,
              }
            : prev
        );
        setLastGeneratedTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
        onNotify(
          'success',
          `Rewrote summary into Simple Language using ${simplified.model_used}.`
        );
      } catch (err: any) {
        onNotify('error', err?.message || 'Could not rewrite summary into simple language.');
      } finally {
        setIsSimplifying(false);
      }
    } else {
      setSummaryResult((prev) =>
        prev
          ? {
              ...prev,
              simple_language: false,
              summary: prev.technical_summary || prev.summary,
              key_points: prev.technical_key_points || prev.key_points,
              action_items: prev.technical_action_items || prev.action_items,
            }
          : prev
      );
      onNotify('success', 'Switched back to standard technical summary.');
    }
  };

  const runSummarize = async (opts: {
    docId: string;
    format: SummaryFormat;
    query: string;
    chunksLimit: number;
    mode?: 'indexed' | 'custom';
    rawText?: string;
    rawTitle?: string;
    simple?: boolean;
    model?: GeminiModelTier;
    showToast?: boolean;
  }) => {
    const activeMode = opts.mode || sourceMode;
    const rawContent = opts.rawText !== undefined ? opts.rawText : customText;
    const rawDocTitle = opts.rawTitle !== undefined ? opts.rawTitle : customTitle;
    const useSimple = opts.simple !== undefined ? opts.simple : simpleLanguage;
    const useModel = opts.model || selectedModel;

    if (activeMode === 'custom') {
      if (!rawContent.trim() || rawContent.trim().length < 20) {
        onNotify('error', 'Please paste at least a sentence or paragraph of text to summarize.');
        return;
      }
    } else if (!opts.docId) {
      onNotify('error', 'Please select an indexed document to summarize.');
      return;
    }

    stopSpeech();
    setIsSummarizing(true);
    try {
      const res = await workspaceApi.summarizeDocument({
        document_id: activeMode === 'indexed' ? opts.docId : undefined,
        custom_text: activeMode === 'custom' ? rawContent.trim() : undefined,
        custom_title: activeMode === 'custom' ? rawDocTitle.trim() || 'Pasted Text' : undefined,
        format: opts.format,
        query: opts.query.trim() || undefined,
        max_chunks: opts.chunksLimit,
        simple_language: useSimple,
        model: useModel,
      });
      setSummaryResult(res);
      setCheckedActions({});
      setLastGeneratedTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      if (opts.showToast) {
        const fmtLabel =
          SUMMARY_FORMATS.find((f) => f.value === opts.format)?.label || opts.format;
        onNotify(
          'success',
          `Generated ${useSimple ? 'Simple Language ' : ''}${fmtLabel} for "${res.filename}"`
        );
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to generate document summary.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const runExplain = async (
    concept: string,
    style: ExplanationStyle,
    docScope: string,
    showToast = false
  ) => {
    const cleanConcept = concept.trim();
    if (!cleanConcept) {
      onNotify('error', 'Please enter a concept or technical term to explain.');
      return;
    }
    setIsExplaining(true);
    try {
      const res = await workspaceApi.explainConcept({
        concept: cleanConcept,
        style,
        document_id: docScope || null,
        k: 4,
      });
      setExplainResult(res);
      if (showToast) {
        onNotify('success', `Generated ${style.replace('_', ' ')} explanation for "${cleanConcept}"`);
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to generate concept explanation.');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!summaryResult) return;
    const mdContent =
      `# ${summaryResult.filename} — ${summaryResult.format.replace(/_/g, ' ').toUpperCase()}\n\n` +
      `## Key Takeaways\n` +
      (summaryResult.key_points || []).map((k) => `- ${k}`).join('\n') +
      `\n\n## Action Items & Verification Checklist\n` +
      (summaryResult.action_items || []).map((a) => `- [ ] ${a}`).join('\n') +
      `\n\n## Summary\n\n${summaryResult.summary}\n`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${summaryResult.filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_Summary.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('success', 'Downloaded summary report as Markdown (.md).');
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Summaries & Concept Explanations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Format-controlled synthesis (`POST /summarize`), instant custom-text summarization, audio briefings, and concept decomposition (`POST /explain`)
          </p>
        </div>

        {/* Interactive Mode Tabs */}
        <div
          role="tablist"
          aria-label="Select AI synthesis workflow"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#11141D] border border-slate-200 dark:border-slate-800 self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'summarize'}
            onClick={() => setActiveTab('summarize')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'summarize'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span>Document Summarization</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'explain'}
            onClick={() => {
              setActiveTab('explain');
              if (!explainResult && !isExplaining) {
                runExplain(conceptInput, explainStyle, explainDocId, false);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'explain'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span>Concept Explanation</span>
          </button>
        </div>
      </div>

      {activeTab === 'summarize' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Configuration Form Panel (4 cols) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSummarize({
                docId: selectedDocId,
                format: summaryFormat,
                query: focusQuery,
                chunksLimit: maxChunks,
                mode: sourceMode,
                showToast: true,
              });
            }}
            className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-5 shadow-2xs"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Summary Parameters
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Summarize an indexed document or paste any text for instant synthesis.
              </p>
            </div>

            {/* Source Mode Toggle: Indexed Document vs Paste Custom Text */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0D13] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSourceMode('indexed')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  sourceMode === 'indexed'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Indexed Doc</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceMode('custom');
                  if (!customText.trim()) {
                    setCustomText(
                      `[Page 1]\n# 1.1 Q4 Enterprise AI Rollout & Governance Plan\nAll production AI agents must enforce strict citation grounding with a p95 latency target of 180ms. Customer data is encrypted using AES-256-GCM with 30-day KMS key rotation.\n\n[Page 2]\n# 1.2 Cost & Infrastructure Targets\nAdopting Scalar Quantization (SQ8) reduces vector memory consumption by 68% while maintaining 99.1% Recall@10 across multi-hop queries.`
                    );
                  }
                }}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  sourceMode === 'custom'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Paste Text</span>
              </button>
            </div>

            {sourceMode === 'indexed' ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="summary-doc-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Target Document
                </label>
                <select
                  id="summary-doc-select"
                  value={selectedDocId}
                  onChange={(e) => {
                    const newDocId = e.target.value;
                    setSelectedDocId(newDocId);
                    runSummarize({
                      docId: newDocId,
                      format: summaryFormat,
                      query: focusQuery,
                      chunksLimit: maxChunks,
                      mode: 'indexed',
                      showToast: true,
                    });
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  {documents.map((doc) => (
                    <option key={doc.doc_id} value={doc.doc_id}>
                      {doc.filename} ({doc.page_count}p · {doc.chunk_count} chunks)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label
                    htmlFor="custom-summary-title"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Document / Note Title
                  </label>
                  <input
                    id="custom-summary-title"
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g., Meeting Notes or Policy Draft"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="custom-summary-textarea"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Paste Text to Summarize
                  </label>
                  <textarea
                    id="custom-summary-textarea"
                    rows={5}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Paste any article, report, contract, or notes here..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Summary Format (Click to switch immediately)
              </span>
              <div className="space-y-2">
                {SUMMARY_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => {
                      setSummaryFormat(fmt.value);
                      runSummarize({
                        docId: selectedDocId,
                        format: fmt.value,
                        query: focusQuery,
                        chunksLimit: maxChunks,
                        mode: sourceMode,
                        showToast: true,
                      });
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      summaryFormat === fmt.value
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {fmt.label}
                      </span>
                      {summaryFormat === fmt.value && (
                        <span className="text-[10px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {fmt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Simple Language (Gemini Plain-English Rewrite) Toggle Card */}
            <div className="rounded-xl border border-[#C7D2FE] dark:border-indigo-500/30 bg-[#EEF2FF]/70 dark:bg-indigo-950/20 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Simple Language Mode
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={simpleLanguage}
                  aria-label="Simple Language toggle"
                  disabled={isSimplifying || isSummarizing}
                  onClick={() => handleToggleSimpleLanguage(!simpleLanguage)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    simpleLanguage
                      ? 'bg-[#A7F3D0] dark:bg-emerald-500/50'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                      simpleLanguage ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Uses Gemini to rewrite complex technical summaries into plain, easy-to-understand conversational explanations and everyday analogies.
              </p>

              <div className="pt-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="summary-gemini-model"
                  className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
                >
                  Gemini Model:
                </label>
                <select
                  id="summary-gemini-model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as GeminiModelTier)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0D13] px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                >
                  <option value="gemini-3.8-flash">gemini-3.8-flash (General)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
                  <option value="gemini-4-argon">gemini-4-argon (Complex)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="summary-focus-query"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Custom Focus Query (Optional)
              </label>
              <input
                id="summary-focus-query"
                type="text"
                value={focusQuery}
                onChange={(e) => setFocusQuery(e.target.value)}
                placeholder="e.g., Focus on encryption, key rotation, and SLAs..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="summary-max-chunks"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  Max Chunks to Synthesize
                </label>
                <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {maxChunks} chunks
                </span>
              </div>
              <input
                id="summary-max-chunks"
                type="range"
                min={2}
                max={12}
                value={maxChunks}
                onChange={(e) => setMaxChunks(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={isSummarizing || (sourceMode === 'indexed' && !selectedDocId)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer shadow-xs"
            >
              <span>{isSummarizing ? 'Synthesizing Summary...' : 'Generate Document Summary'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Summary Output Panel (8 cols) */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 sm:p-6 space-y-5 shadow-2xs">
            {isSummarizing || isSimplifying ? (
              <div className="py-14 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>
                    {isSimplifying
                      ? `Rewriting summary into Simple Language via Gemini (${selectedModel})...`
                      : `Synthesizing ${SUMMARY_FORMATS.find((f) => f.value === summaryFormat)?.label || 'Summary'} via POST /summarize...`}
                  </span>
                </div>
                <div className="space-y-2.5 animate-pulse">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                </div>
              </div>
            ) : summaryResult ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {summaryResult.filename}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {SUMMARY_FORMATS.find((f) => f.value === summaryResult.format)?.label ||
                          summaryResult.format}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{summaryResult.page_range}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {summaryResult.chunks_used}/{summaryResult.total_chunks} chunks ({summaryResult.coverage_pct}% coverage)
                      </span>
                      {lastGeneratedTime && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Updated {lastGeneratedTime}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Toolbar: Simple Language Toggle, Audio Briefing, Export Markdown, Copy Summary */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={simpleLanguage}
                      onClick={() => handleToggleSimpleLanguage(!simpleLanguage)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                        simpleLanguage
                          ? 'border-[#A7F3D0] bg-[#D1FAE5] text-[#065F46] dark:bg-emerald-950/40 dark:border-emerald-500/40 dark:text-emerald-300'
                          : 'border-[#DDD6FE] bg-[#EDE9FE] text-[#4C1D95] hover:bg-[#DDD6FE] dark:bg-violet-950/30 dark:border-violet-500/30 dark:text-violet-300'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{simpleLanguage ? 'Simple Language: ON' : 'Simple Language'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleAudioBriefing}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                        isSpeaking
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                          : 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
                      }`}
                    >
                      {isSpeaking ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop Audio Briefing</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen Audio Briefing</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadMarkdown}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export .MD</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(activeDisplayedSummary);
                        setCopiedSummary(true);
                        onNotify('success', 'Summary copied to clipboard.');
                        setTimeout(() => setCopiedSummary(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {copiedSummary ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Summary</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Simple Language Active Callout Banner */}
                {simpleLanguage && (
                  <div className="rounded-lg border border-[#A7F3D0] dark:border-emerald-500/30 bg-[#D1FAE5]/60 dark:bg-emerald-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-[#065F46] dark:text-emerald-300">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>Simple Language Active ({summaryResult.model_used || selectedModel}):</strong> Technical jargon has been rewritten into plain, easy-to-understand conversational explanations and everyday analogies.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleSimpleLanguage(false)}
                      className="text-xs font-semibold underline text-[#065F46] dark:text-emerald-300 cursor-pointer shrink-0"
                    >
                      Switch to Technical View
                    </button>
                  </div>
                )}

                {/* Interactive Document Section & Hackathon Team Quick-Picker */}
                {sourceMode === 'indexed' && quickTopics.length > 1 && (
                  <div className="rounded-xl border border-[#C7D2FE] dark:border-indigo-500/30 bg-[#EEF2FF]/65 dark:bg-indigo-950/20 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#312E81] dark:text-indigo-200">
                        <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          Interactive Topic & Section Explorer — Click any section or Team to summarize in plain words:
                        </span>
                      </div>
                      {quickTopics.some((t) => t.category === 'team') && (
                        <select
                          aria-label="Jump to specific Hackathon Team"
                          value={activeTopicId.startsWith('team_') ? activeTopicId : ''}
                          onChange={(e) => {
                            const picked = quickTopics.find((t) => t.id === e.target.value);
                            if (picked) {
                              setActiveTopicId(picked.id);
                              setFocusQuery(picked.query);
                              setInlineAnswer(null);
                              runSummarize({
                                docId: selectedDocId,
                                format: summaryFormat,
                                query: picked.query,
                                chunksLimit: maxChunks,
                                mode: 'indexed',
                                simple: simpleLanguage,
                                showToast: true,
                              });
                            }
                          }}
                          className="rounded-lg border border-[#C7D2FE] dark:border-slate-700 bg-white dark:bg-[#0B0D13] px-2.5 py-1 text-xs font-semibold text-[#312E81] dark:text-indigo-300 cursor-pointer"
                        >
                          <option value="">Jump to any Team (1–23)...</option>
                          {quickTopics
                            .filter((t) => t.category === 'team')
                            .map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.label} (p. {team.page})
                              </option>
                            ))}
                        </select>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {quickTopics.slice(0, 9).map((topic) => {
                        const isSelected = activeTopicId === topic.id;
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => {
                              setActiveTopicId(topic.id);
                              setFocusQuery(topic.query);
                              setInlineAnswer(null);
                              runSummarize({
                                docId: selectedDocId,
                                format: summaryFormat,
                                query: topic.query,
                                chunksLimit: maxChunks,
                                mode: 'indexed',
                                simple: simpleLanguage,
                                showToast: true,
                              });
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#312E81] text-white dark:bg-indigo-500 shadow-2xs'
                                : 'bg-white/90 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-[#C7D2FE]/80 dark:border-slate-800 hover:bg-[#E0E7FF]'
                            }`}
                          >
                            {topic.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Key Takeaways Strip */}
                {activeDisplayedKeyPoints.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1017] p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>
                        {simpleLanguage
                          ? 'Plain-Language Key Takeaways & Citations'
                          : 'Key Takeaways & Citations'}
                      </span>
                    </h3>
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                      {activeDisplayedKeyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Main Markdown Summary */}
                <MarkdownRenderer content={activeDisplayedSummary} />

                {/* Interactive Extracted Action Items & Governance Checklist */}
                {activeDisplayedActionItems.length > 0 && (
                  <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-500/25 bg-indigo-50/40 dark:bg-indigo-950/15 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {simpleLanguage
                            ? 'Plain-English Step-by-Step Action Checklist'
                            : 'Extracted Action Items & Audit Checklist'}
                        </span>
                      </h3>
                      <span className="text-[11px] font-mono text-slate-500">
                        {Object.values(checkedActions).filter(Boolean).length}/
                        {activeDisplayedActionItems.length} verified
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {activeDisplayedActionItems.map((item, idx) => {
                        const isDone = Boolean(checkedActions[idx]);
                        return (
                          <label
                            key={idx}
                            className={`flex items-start gap-2.5 p-2 rounded-md border text-xs transition-colors cursor-pointer ${
                              isDone
                                ? 'border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 text-slate-500 line-through'
                                : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#11141D] text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() =>
                                setCheckedActions((prev) => ({
                                  ...prev,
                                  [idx]: !prev[idx],
                                }))
                              }
                              className="mt-0.5 accent-indigo-600 cursor-pointer"
                            />
                            <span>{item}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inline Interactive "Ask About This Summary" Companion Box */}
                <div className="rounded-xl border border-[#DDD6FE] dark:border-violet-500/30 bg-[#EDE9FE]/55 dark:bg-violet-950/15 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4C1D95] dark:text-violet-200">
                      <MessageCircle className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      <span>Ask a Quick Question About This Summary (Instant Plain-English Answer)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        'Give me a real-world analogy',
                        'Quiz me with 3 questions on this',
                        'What do I need to show in the demo?',
                      ].map((chip, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          disabled={isAskingInline}
                          onClick={async () => {
                            const fullQ = focusQuery ? `${chip} for ${focusQuery}` : chip;
                            setInlineQuestion(fullQ);
                            setIsAskingInline(true);
                            try {
                              const res = await workspaceApi.askQuestion({
                                question: fullQ,
                                document_id: sourceMode === 'indexed' ? selectedDocId : null,
                                role_persona: 'plain_language_coach',
                                model: selectedModel,
                              });
                              setInlineAnswer(res.answer);
                              setInlineFollowUps(res.follow_up_questions || []);
                            } catch (err: any) {
                              onNotify('error', err?.message || 'Failed to answer question.');
                            } finally {
                              setIsAskingInline(false);
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-[#DDD6FE] dark:border-slate-700 text-[11px] font-medium text-[#4C1D95] dark:text-violet-300 hover:bg-[#DDD6FE]/60 transition-colors cursor-pointer"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!inlineQuestion.trim() || isAskingInline) return;
                      setIsAskingInline(true);
                      try {
                        const res = await workspaceApi.askQuestion({
                          question: inlineQuestion.trim(),
                          document_id: sourceMode === 'indexed' ? selectedDocId : null,
                          role_persona: 'plain_language_coach',
                          model: selectedModel,
                        });
                        setInlineAnswer(res.answer);
                        setInlineFollowUps(res.follow_up_questions || []);
                      } catch (err: any) {
                        onNotify('error', err?.message || 'Failed to answer question.');
                      } finally {
                        setIsAskingInline(false);
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={inlineQuestion}
                      onChange={(e) => setInlineQuestion(e.target.value)}
                      placeholder="Ask anything about this document (e.g., 'Explain Team 2 in simple words' or 'How is this graded?')..."
                      className="flex-1 rounded-lg border border-[#DDD6FE] dark:border-slate-700 bg-white dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                    <button
                      type="submit"
                      disabled={!inlineQuestion.trim() || isAskingInline}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4C1D95] hover:bg-[#5B21B6] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      <span>{isAskingInline ? 'Thinking...' : 'Ask Now'}</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  {inlineAnswer && (
                    <div className="rounded-lg border border-[#C7D2FE] dark:border-slate-800 bg-white dark:bg-[#11141D] p-4 space-y-3">
                      <MarkdownRenderer content={inlineAnswer} />
                      {inlineFollowUps.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Follow-up:
                          </span>
                          {inlineFollowUps.map((fq, fIdx) => (
                            <button
                              key={fIdx}
                              type="button"
                              onClick={async () => {
                                setInlineQuestion(fq);
                                setIsAskingInline(true);
                                try {
                                  const res = await workspaceApi.askQuestion({
                                    question: fq,
                                    document_id: sourceMode === 'indexed' ? selectedDocId : null,
                                    role_persona: 'plain_language_coach',
                                    model: selectedModel,
                                  });
                                  setInlineAnswer(res.answer);
                                  setInlineFollowUps(res.follow_up_questions || []);
                                } catch {
                                  // ignore
                                } finally {
                                  setIsAskingInline(false);
                                }
                              }}
                              className="px-2.5 py-1 rounded-md bg-[#EEF2FF] dark:bg-slate-800 text-[11px] font-medium text-[#312E81] dark:text-indigo-300 hover:bg-[#E0E7FF] transition-colors cursor-pointer"
                            >
                              {fq}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Supporting Excerpts Accordion */}
                <SourceEvidenceAccordion
                  contexts={summaryResult.contexts}
                  title="Supporting document excerpts used in summary"
                  defaultOpen={false}
                  onInspectDocument={onInspectDocument}
                />
              </>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Select a document on the left and click "Generate Document Summary".
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Concept Explanation Tab (`POST /explain`) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Concept Explainer Form (4 cols) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runExplain(conceptInput, explainStyle, explainDocId, true);
            }}
            className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-5 shadow-2xs"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Concept Explanation Setup
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter a domain concept and select an explanation style (`POST /explain`).
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="explain-concept-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Concept or Technical Question
              </label>
              <input
                id="explain-concept-input"
                type="text"
                required
                value={conceptInput}
                onChange={(e) => setConceptInput(e.target.value)}
                placeholder="e.g., Reciprocal Rank Fusion (RRF)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400">Presets:</span>
                {QUICK_CONCEPTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setConceptInput(c);
                      runExplain(c, explainStyle, explainDocId, true);
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer text-left"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Explanation Style
              </span>
              <div className="space-y-2">
                {EXPLAIN_STYLES.map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => {
                      setExplainStyle(st.value);
                      runExplain(conceptInput, st.value, explainDocId, true);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      explainStyle === st.value
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {st.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {st.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="explain-doc-scope"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Document Scope
              </label>
              <select
                id="explain-doc-scope"
                value={explainDocId}
                onChange={(e) => {
                  const newScope = e.target.value;
                  setExplainDocId(newScope);
                  runExplain(conceptInput, explainStyle, newScope, true);
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">All Indexed Documents ({documents.length})</option>
                {documents.map((doc) => (
                  <option key={doc.doc_id} value={doc.doc_id}>
                    {doc.filename}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isExplaining || !conceptInput.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer shadow-xs"
            >
              <span>{isExplaining ? 'Generating Explanation...' : 'Explain Concept'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Explanation Output Panel (8 cols) */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 sm:p-6 space-y-5 shadow-2xs">
            {isExplaining ? (
              <div className="py-12 space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Retrieving evidence and building {explainStyle} explanation...</span>
                </div>
                <div className="space-y-2.5 animate-pulse">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-4/5" />
                </div>
              </div>
            ) : explainResult ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Concept: {explainResult.concept}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">Style: {explainResult.style.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>Scope: {explainResult.document_scope}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{explainResult.latency_ms}ms</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(explainResult.explanation);
                      setCopiedExplain(true);
                      onNotify('success', 'Explanation copied to clipboard.');
                      setTimeout(() => setCopiedExplain(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {copiedExplain ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Explanation</span>
                      </>
                    )}
                  </button>
                </div>

                <MarkdownRenderer content={explainResult.explanation} />

                {/* Key Takeaways & Prerequisites Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017] p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Core Takeaways
                    </h3>
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                      {explainResult.key_takeaways.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017] p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Prerequisites & Related Domain Concepts
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Prerequisites: </strong>
                        {explainResult.prerequisites.join(' · ')}
                      </div>
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Related Terms: </strong>
                        {explainResult.related_terms.join(' · ')}
                      </div>
                    </div>
                  </div>
                </div>

                <SourceEvidenceAccordion
                  contexts={explainResult.contexts}
                  title="Retrieved document contexts backing this explanation"
                  defaultOpen={true}
                  onInspectDocument={onInspectDocument}
                />
              </>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Enter a concept on the left and click "Explain Concept".
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
