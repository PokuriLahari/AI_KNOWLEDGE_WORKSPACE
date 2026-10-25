import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Plus,
  Copy,
  Check,
  RotateCcw,
  FileText,
  Compass,
  Clock,
  Trash2,
  MessageSquare,
  AlertCircle,
  BookOpen,
  Sparkles,
  Volume2,
  Square,
  ListChecks,
  HelpCircle,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import {
  DocumentItem,
  DocumentChunk,
  ConversationSession,
  ChatMessage,
  RouteResponse,
  ChatRolePersona,
  GeminiModelTier,
  CHAT_ROLE_PERSONAS,
  DocumentQuickTopic,
  extractDocumentQuickTopics,
  cleanChunkExcerpt,
} from '../lib/ragCore';
import { workspaceApi, formatRelativeTime } from '../lib/apiClient';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceEvidenceAccordion } from './SourceEvidenceAccordion';

interface AssistantChatViewProps {
  documents: DocumentItem[];
  sessions: ConversationSession[];
  activeSessionId: string | null;
  initialQuestion?: string | null;
  initialDocFilter?: string | null;
  onClearInitialPrompt: () => void;
  onSelectSession: (sessionId: string | null) => void;
  onRefreshSessions: () => Promise<void>;
  onInspectDocument: (docId: string) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const DEFAULT_PROMPTS = [
  {
    title: 'Explain This Document in Simple Words',
    question: 'What is this document about in simple words?',
    category: 'Plain-English Overview',
  },
  {
    title: 'Key Rules & Requirements Breakdown',
    question: 'Explain the most important rules and requirements in this document step by step.',
    category: 'Step-by-Step Guide',
  },
  {
    title: 'Real-World Analogy & Examples',
    question: 'Explain this document using a simple real-world analogy.',
    category: 'Everyday Analogy',
  },
  {
    title: 'Interactive 3-Question Knowledge Quiz',
    question: 'Quiz me with 3 questions on this document to test my understanding.',
    category: 'Interactive Quiz',
  },
];

export const AssistantChatView: React.FC<AssistantChatViewProps> = ({
  documents,
  sessions,
  activeSessionId,
  initialQuestion,
  initialDocFilter,
  onClearInitialPrompt,
  onSelectSession,
  onRefreshSessions,
  onInspectDocument,
  onNotify,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string>(
    initialDocFilter || documents[0]?.doc_id || ''
  );
  const [topK, setTopK] = useState<number>(4);
  const [rolePersona, setRolePersona] = useState<ChatRolePersona>('plain_language_coach');
  const [selectedModel, setSelectedModel] = useState<GeminiModelTier>('gemini-3.8-flash');
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Interactive Document Quick Topics & Split-Screen Reader
  const [docChunks, setDocChunks] = useState<DocumentChunk[]>([]);
  const [quickTopics, setQuickTopics] = useState<DocumentQuickTopic[]>([]);
  const [showReaderSplit, setShowReaderSplit] = useState<boolean>(false);
  const [readerFilterText, setReaderFilterText] = useState<string>('');
  const [highlightedCitation, setHighlightedCitation] = useState<{
    docId: string;
    pageNumber: number;
    endPageNumber?: number;
    chunkId?: string;
    sectionTitle?: string;
    excerptSnippet?: string;
    rawLabel?: string;
  } | null>(null);

  // Live intent preview via POST /route
  const [routePreview, setRoutePreview] = useState<RouteResponse | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const readerScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleOpenCitationInReader = (opts: {
    docId?: string | null;
    pageNumber: number;
    endPageNumber?: number;
    chunkId?: string;
    sectionTitle?: string;
    excerptSnippet?: string;
    rawLabel?: string;
  }) => {
    const resolvedDocId = opts.docId || selectedDocId || documents[0]?.doc_id || '';
    if (resolvedDocId && resolvedDocId !== selectedDocId) {
      setSelectedDocId(resolvedDocId);
    }
    setReaderFilterText('');
    setShowReaderSplit(true);
    setHighlightedCitation({
      docId: resolvedDocId,
      pageNumber: opts.pageNumber,
      endPageNumber: opts.endPageNumber,
      chunkId: opts.chunkId,
      sectionTitle: opts.sectionTitle,
      excerptSnippet: opts.excerptSnippet,
      rawLabel: opts.rawLabel || `Page ${opts.pageNumber}`,
    });
  };

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

  // Load chunks & interactive quick-topics for the active document
  useEffect(() => {
    const targetId = selectedDocId || documents[0]?.doc_id;
    if (!targetId) {
      setDocChunks([]);
      setQuickTopics([]);
      return;
    }
    let cancelled = false;
    workspaceApi
      .getDocumentDetail(targetId)
      .then((detail) => {
        if (!cancelled) {
          setDocChunks(detail.chunks || []);
          setQuickTopics(extractDocumentQuickTopics(detail.chunks || []));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocChunks([]);
          setQuickTopics([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDocId, documents]);

  // Automatically scroll Side-by-Side Document Reader to the highlighted citation page/paragraph
  useEffect(() => {
    if (!showReaderSplit || !highlightedCitation || docChunks.length === 0) return;
    const timer = setTimeout(() => {
      const container = readerScrollContainerRef.current;
      if (!container) return;
      const targetEl =
        (highlightedCitation.chunkId
          ? container.querySelector(`[data-reader-chunk-id="${highlightedCitation.chunkId}"]`)
          : null) ||
        container.querySelector(`[data-reader-page="${highlightedCitation.pageNumber}"]`);
      if (targetEl && typeof (targetEl as HTMLElement).scrollIntoView === 'function') {
        (targetEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [showReaderSplit, highlightedCitation, docChunks]);

  // Sync messages when activeSessionId changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    const found = sessions.find((s) => s.session_id === activeSessionId);
    if (found) {
      setMessages(found.messages);
      if (found.document_id) {
        setSelectedDocId(found.document_id);
      }
    }
  }, [activeSessionId, sessions]);

  // Handle initial question passed from Overview or Document Library
  useEffect(() => {
    if (initialDocFilter !== undefined && initialDocFilter !== null) {
      setSelectedDocId(initialDocFilter);
    }
    if (initialQuestion) {
      const q = initialQuestion;
      const docScope = initialDocFilter ?? selectedDocId;
      onClearInitialPrompt();
      executeAsk(q, docScope || null);
    }
  }, [initialQuestion, initialDocFilter]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Debounced POST /route preview while typing
  useEffect(() => {
    const q = inputQuestion.trim();
    if (q.length < 5) {
      setRoutePreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await workspaceApi.routeQuery(q, controller.signal);
        setRoutePreview(res);
      } catch {
        // ignore abort
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputQuestion]);

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
  };

  const toggleSpeakMessage = (msgId: string, content: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onNotify('error', 'Speech synthesis is not supported in this browser.');
      return;
    }
    if (speakingMsgId === msgId) {
      stopSpeech();
      return;
    }
    window.speechSynthesis.cancel();
    const cleanSpeech = content.replace(/[#*`|>-]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(cleanSpeech.slice(0, 1600));
    utterance.rate = 1.03;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const executeAsk = async (questionText: string, docOverride?: string | null) => {
    const cleanQuestion = questionText.trim();
    if (!cleanQuestion || isSending) return;

    stopSpeech();
    const targetDocId = docOverride !== undefined ? docOverride : selectedDocId || null;
    setErrorBanner(null);
    setLastFailedQuestion(null);
    setInputQuestion('');
    setRoutePreview(null);

    const optimisticUserMsg: ChatMessage = {
      id: `temp_u_${Date.now()}`,
      role: 'user',
      content: cleanQuestion,
      timestamp: new Date().toISOString(),
      document_id: targetDocId,
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsSending(true);

    try {
      const res = await workspaceApi.askQuestion({
        question: cleanQuestion,
        k: topK,
        session_id: activeSessionId || undefined,
        document_id: targetDocId,
        model: selectedModel,
        role_persona: rolePersona,
      });

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        timestamp: new Date().toISOString(),
        document_id: res.document_id,
        contexts: res.contexts,
        intent: res.intent,
        routing: res.routing,
        latency_ms: res.latency_ms,
        model_used: res.model_used,
        role_persona: res.role_persona,
        follow_up_questions: res.follow_up_questions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await onRefreshSessions();
      if (!activeSessionId) {
        onSelectSession(res.session_id);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to retrieve grounded response from /ask.';
      setErrorBanner(msg);
      setLastFailedQuestion(cleanQuestion);
      onNotify('error', msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 1800);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await workspaceApi.deleteSession(sessionId);
      if (activeSessionId === sessionId) {
        onSelectSession(null);
        setMessages([]);
      }
      await onRefreshSessions();
      onNotify('success', 'Conversation removed.');
    } catch (err: any) {
      onNotify('error', err?.message || 'Could not delete conversation.');
    }
  };

  const selectedDocObj = documents.find((d) => d.doc_id === selectedDocId) || documents[0];
  const hasTeams = quickTopics.some((t) => t.category === 'team');

  const dynamicStarterCards = hasTeams
    ? [
        {
          title: 'What Is This Document About? (In Simple Words)',
          question: 'What is this document about in simple words?',
          category: '30-Second Plain Overview',
        },
        {
          title: 'The 6 Golden Rules (B1–B6) Explained Simply',
          question: 'Explain the B1–B6 architecture, Kafka, and security rules in simple words.',
          category: 'Core Project Rules',
        },
        {
          title: 'Break Down Team 1: Parcel Misroute',
          question: 'Explain Team 1: Parcel misroute interception in simple words.',
          category: 'Team Challenge Walkthrough',
        },
        {
          title: 'Quiz Me for the 100-Mark Demo Review',
          question: 'Quiz me with 3 viva questions on this document.',
          category: 'Interactive Exam Prep',
        },
      ]
    : DEFAULT_PROMPTS;

  const filteredReaderChunks = docChunks.filter((c) => {
    if (!readerFilterText.trim()) return true;
    const q = readerFilterText.toLowerCase();
    return (
      c.section_title.toLowerCase().includes(q) ||
      c.text.toLowerCase().includes(q) ||
      `page ${c.page_number}`.includes(q)
    );
  });

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-5 h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4">
      {/* Left Context & Session History Rail (auto-collapses when Side-by-Side Doc Reader is open) */}
      <aside
        className={`w-full lg:w-60 shrink-0 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden max-h-44 lg:max-h-full ${
          showReaderSplit ? 'lg:hidden' : ''
        }`}
      >
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Conversations
          </span>
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              onSelectSession(null);
              setMessages([]);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/70">
          {sessions.length === 0 ? (
            <div className="p-5 text-center text-xs text-slate-500">
              No saved conversations yet.
            </div>
          ) : (
            sessions.map((sess) => {
              const isCurrent = sess.session_id === activeSessionId;
              return (
                <div
                  key={sess.session_id}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors ${
                    isCurrent
                      ? 'bg-[#EEF2FF] dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(sess.session_id)}
                    className="flex-1 text-left min-w-0 cursor-pointer space-y-0.5"
                  >
                    <div
                      className={`text-xs truncate ${
                        isCurrent
                          ? 'font-semibold text-[#312E81] dark:text-indigo-400'
                          : 'font-medium text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {sess.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{formatRelativeTime(sess.updated_at)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{sess.message_count} msgs</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(e, sess.session_id)}
                    aria-label={`Delete conversation ${sess.title}`}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Interactive Chat Workspace */}
      <div className="flex-1 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden min-h-0">
        {/* Top Context & Role Toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {selectedDocId && selectedDocObj
                ? `Chatting with: ${selectedDocObj.filename}`
                : `All Indexed Documents (${documents.length} files)`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="chat-doc-selector"
                className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Document:
              </label>
              <select
                id="chat-doc-selector"
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="rounded-md border border-[#C7D2FE] dark:border-slate-800 bg-white dark:bg-[#0B0D13] px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">All Documents ({documents.length})</option>
                {documents.map((doc) => (
                  <option key={doc.doc_id} value={doc.doc_id}>
                    {doc.filename} ({doc.page_count}p)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label
                htmlFor="chat-role-selector"
                className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Style:
              </label>
              <select
                id="chat-role-selector"
                value={rolePersona}
                onChange={(e) => setRolePersona(e.target.value as ChatRolePersona)}
                className="rounded-md border border-[#A7F3D0] dark:border-slate-800 bg-[#D1FAE5]/70 dark:bg-[#0B0D13] px-2.5 py-1 text-xs font-semibold text-[#065F46] dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {Object.values(CHAT_ROLE_PERSONAS).map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label
                htmlFor="chat-model-selector"
                className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Model:
              </label>
              <select
                id="chat-model-selector"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as GeminiModelTier)}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0D13] px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                <option value="gemini-4-argon">gemini-4-argon</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowReaderSplit((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                showReaderSplit
                  ? 'border-[#C7D2FE] bg-[#312E81] text-white'
                  : 'border-[#C7D2FE] bg-[#EEF2FF] text-[#312E81] hover:bg-[#E0E7FF] dark:bg-slate-800 dark:border-slate-700 dark:text-indigo-300'
              }`}
            >
              {showReaderSplit ? (
                <>
                  <PanelRightClose className="w-3.5 h-3.5" />
                  <span>Hide Doc Reader</span>
                </>
              ) : (
                <>
                  <PanelRightOpen className="w-3.5 h-3.5" />
                  <span>Side-by-Side Doc Reader</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Interactive Topic & Team Quick-Bar (1-Click Document Exploration) */}
        {quickTopics.length > 0 && (
          <div className="px-3.5 py-1.5 border-b border-[#C7D2FE]/70 dark:border-slate-800 bg-[#EEF2FF]/60 dark:bg-indigo-950/15 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[11px] font-semibold text-[#312E81] dark:text-indigo-300 flex items-center gap-1 mr-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>1-Click Ask:</span>
              </span>

              <button
                type="button"
                disabled={isSending}
                onClick={() =>
                  executeAsk(
                    'What is this document about in simple words?',
                    selectedDocId || documents[0]?.doc_id || null
                  )
                }
                className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-[#C7D2FE] dark:border-slate-700 text-[11px] font-medium text-[#312E81] dark:text-indigo-200 hover:bg-[#E0E7FF] transition-colors cursor-pointer whitespace-nowrap"
              >
                What is this doc about?
              </button>

              {quickTopics
                .filter((t) => t.id !== 'overview')
                .slice(0, 3)
                .map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    disabled={isSending}
                    onClick={() =>
                      executeAsk(
                        `Explain ${topic.label} in simple, easy-to-understand words.`,
                        selectedDocId || documents[0]?.doc_id || null
                      )
                    }
                    className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-[#C7D2FE] dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-[#E0E7FF] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {topic.label}
                  </button>
                ))}
            </div>

            {hasTeams && (
              <select
                aria-label="Ask about a specific Hackathon Team"
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const picked = quickTopics.find((t) => t.id === val);
                  if (picked) {
                    executeAsk(
                      `Explain ${picked.label} in simple words: what problem are we solving, what 4 apps do we build, and what do we show in the demo?`,
                      selectedDocId || documents[0]?.doc_id || null
                    );
                  }
                  e.target.value = '';
                }}
                className="rounded-md border border-[#C7D2FE] dark:border-slate-700 bg-white dark:bg-[#0B0D13] px-2.5 py-1 text-[11px] font-semibold text-[#312E81] dark:text-indigo-300 cursor-pointer"
              >
                <option value="">Pick any Team (1–23) to explain...</option>
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
        )}

        {/* Messages Scroll Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-4 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-11 h-11 rounded-xl bg-[#EEF2FF] dark:bg-indigo-500/10 border border-[#C7D2FE] dark:border-indigo-500/20 flex items-center justify-center mx-auto">
                  <BookOpen className="w-5 h-5 text-[#312E81] dark:text-indigo-400" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Interactive Document Chat ({selectedDocObj?.filename || 'All Documents'})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Click any topic or question below, or type your own question in plain English. Every response includes interactive <strong>1-click follow-ups</strong>, <strong>real-world analogies</strong>, and <strong>page citations</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dynamicStarterCards.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      executeAsk(item.question, selectedDocId || documents[0]?.doc_id || null)
                    }
                    className="p-3.5 rounded-xl border border-[#C7D2FE] dark:border-slate-800 hover:border-indigo-500 bg-[#EEF2FF]/45 dark:bg-[#0D1017] text-left transition-colors cursor-pointer space-y-1 group"
                  >
                    <div className="text-[11px] font-semibold text-[#4338CA] dark:text-indigo-400">
                      {item.category}
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {item.question}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-2xl rounded-xl bg-[#312E81] dark:bg-indigo-600 text-white px-4 py-3 text-sm leading-relaxed shadow-2xs">
                    <div>{msg.content}</div>
                    {msg.document_id && (
                      <div className="mt-1.5 text-[11px] text-indigo-200 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        <span>
                          Document:{' '}
                          {documents.find((d) => d.doc_id === msg.document_id)?.filename ||
                            msg.document_id}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1017]/90 p-4 sm:p-5 space-y-3.5 shadow-2xs">
                    {/* Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {msg.role_persona && CHAT_ROLE_PERSONAS[msg.role_persona]
                            ? CHAT_ROLE_PERSONAS[msg.role_persona].label
                            : 'Simple Language Explainer'}
                        </span>
                        {msg.contexts && msg.contexts[0] && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenCitationInReader({
                                  docId: msg.contexts![0].document_id,
                                  pageNumber: msg.contexts![0].page_number,
                                  chunkId: msg.contexts![0].chunk_id,
                                  sectionTitle: msg.contexts![0].section_title,
                                  excerptSnippet: msg.contexts![0].excerpt,
                                  rawLabel: `${msg.contexts![0].filename} (p. ${msg.contexts![0].page_number})`,
                                })
                              }
                              title="Click to open and highlight this cited page in Side-by-Side Reader"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] text-[#312E81] dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-300 font-medium cursor-pointer transition-colors"
                            >
                              <BookOpen className="w-3 h-3 text-indigo-600 shrink-0" />
                              <span>
                                {msg.contexts[0].filename} (p. {msg.contexts[0].page_number})
                              </span>
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleSpeakMessage(msg.id, msg.content)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          {speakingMsgId === msg.id ? (
                            <>
                              <Square className="w-3 h-3 fill-current text-rose-500" />
                              <span className="text-rose-600">Stop Audio</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Listen Aloud</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          aria-label="Copy assistant response"
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Generated Synthesis Content with Interactive Citation Links */}
                    <MarkdownRenderer
                      content={msg.content}
                      onCitationClick={(cit) => {
                        const matchedCtx =
                          msg.contexts?.find((c) => c.page_number === cit.page) ||
                          msg.contexts?.[0];
                        handleOpenCitationInReader({
                          docId:
                            matchedCtx?.document_id ||
                            msg.document_id ||
                            selectedDocId ||
                            documents[0]?.doc_id,
                          pageNumber: cit.page,
                          endPageNumber: cit.endPage,
                          chunkId:
                            matchedCtx?.page_number === cit.page
                              ? matchedCtx.chunk_id
                              : undefined,
                          sectionTitle:
                            cit.section ||
                            (matchedCtx?.page_number === cit.page
                              ? matchedCtx.section_title
                              : undefined),
                          excerptSnippet:
                            matchedCtx?.page_number === cit.page
                              ? matchedCtx.excerpt
                              : undefined,
                          rawLabel: cit.rawLabel,
                        });
                      }}
                    />

                    {/* Interactive Document Citations Bar (Click any citation to open & highlight in Side-by-Side View) */}
                    {msg.contexts && msg.contexts.length > 0 && (
                      <div className="rounded-lg bg-[#EEF2FF]/55 dark:bg-indigo-950/20 border border-[#C7D2FE]/90 dark:border-indigo-800/50 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#312E81] dark:text-indigo-300">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                            <span>
                              Interactive Citations (Click to open & highlight in Side-by-Side Reader):
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.contexts.map((ctx, cIdx) => {
                            const isHighlighted =
                              showReaderSplit &&
                              highlightedCitation &&
                              (highlightedCitation.chunkId === ctx.chunk_id ||
                                (highlightedCitation.docId === ctx.document_id &&
                                  highlightedCitation.pageNumber === ctx.page_number));
                            return (
                              <button
                                key={ctx.chunk_id || cIdx}
                                type="button"
                                onClick={() =>
                                  handleOpenCitationInReader({
                                    docId: ctx.document_id,
                                    pageNumber: ctx.page_number,
                                    chunkId: ctx.chunk_id,
                                    sectionTitle: ctx.section_title,
                                    excerptSnippet: ctx.excerpt,
                                    rawLabel: `[${cIdx + 1}] Page ${ctx.page_number} · ${ctx.section_title}`,
                                  })
                                }
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                                  isHighlighted
                                    ? 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E] font-semibold shadow-2xs'
                                    : 'bg-white dark:bg-slate-900 border-[#C7D2FE] dark:border-slate-700 text-[#312E81] dark:text-indigo-200 hover:bg-[#E0E7FF]'
                                }`}
                              >
                                <span className="font-mono font-semibold">[{cIdx + 1}]</span>
                                <span>Page {ctx.page_number}</span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate max-w-[180px]">{ctx.section_title}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Interactive 1-Click Reaction Toolbar on Every Assistant Message */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 mr-1">
                        Interactive Actions:
                      </span>
                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() =>
                          executeAsk(
                            'Explain that even simpler using a real-world analogy',
                            msg.document_id ?? (selectedDocId || null)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#D1FAE5]/80 dark:bg-emerald-950/30 border border-[#A7F3D0] dark:border-emerald-500/30 text-[11px] font-semibold text-[#065F46] dark:text-emerald-300 hover:bg-[#A7F3D0]/70 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Explain Simpler (Analogy)</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() =>
                          executeAsk(
                            'Turn this into a step-by-step action checklist',
                            msg.document_id ?? (selectedDocId || null)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#EEF2FF] dark:bg-indigo-950/30 border border-[#C7D2FE] dark:border-indigo-500/30 text-[11px] font-semibold text-[#312E81] dark:text-indigo-300 hover:bg-[#E0E7FF] transition-colors cursor-pointer"
                      >
                        <ListChecks className="w-3 h-3" />
                        <span>Step-by-Step Checklist</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() =>
                          executeAsk(
                            'Quiz me with 3 questions on this topic',
                            msg.document_id ?? (selectedDocId || null)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#EDE9FE] dark:bg-violet-950/30 border border-[#DDD6FE] dark:border-violet-500/30 text-[11px] font-semibold text-[#4C1D95] dark:text-violet-300 hover:bg-[#DDD6FE] transition-colors cursor-pointer"
                      >
                        <HelpCircle className="w-3 h-3" />
                        <span>Quiz Me (3 Questions)</span>
                      </button>
                    </div>

                    {/* Clickable Follow-Up Question Chips */}
                    {msg.follow_up_questions && msg.follow_up_questions.length > 0 && (
                      <div className="rounded-lg bg-slate-50/90 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3 space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Continue the conversation (click any question):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.follow_up_questions.map((followQ, fqIdx) => (
                            <button
                              key={fqIdx}
                              type="button"
                              disabled={isSending}
                              onClick={() =>
                                executeAsk(
                                  followQ,
                                  msg.document_id ?? (selectedDocId || null)
                                )
                              }
                              className="text-left px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-[#C7D2FE] dark:border-slate-700 text-xs font-medium text-[#312E81] dark:text-indigo-200 hover:bg-[#EEF2FF] transition-colors cursor-pointer"
                            >
                              {followQ} →
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Retrieved Evidence & Citations Accordion */}
                    {msg.contexts && msg.contexts.length > 0 && (
                      <SourceEvidenceAccordion
                        contexts={msg.contexts}
                        defaultOpen={false}
                        onInspectDocument={onInspectDocument}
                        onHighlightCitation={(ctx) =>
                          handleOpenCitationInReader({
                            docId: ctx.document_id,
                            pageNumber: ctx.page_number,
                            chunkId: ctx.chunk_id,
                            sectionTitle: ctx.section_title,
                            excerptSnippet: ctx.excerpt,
                            rawLabel: `Page ${ctx.page_number} · ${ctx.section_title}`,
                          })
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#0D1017] p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Reading document pages and writing a clear, simple answer...</span>
              </div>
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
              </div>
            </div>
          )}

          {errorBanner && (
            <div className="w-full max-w-3xl rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-xs text-rose-600 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorBanner}</span>
              </div>
              {lastFailedQuestion && (
                <button
                  type="button"
                  onClick={() => executeAsk(lastFailedQuestion)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Multiline Message Composer Footer */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#0D1017]">
          {routePreview && (
            <div className="mb-2 px-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Compass className="w-3 h-3 text-indigo-500" />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Detected Intent: {routePreview.intent.toUpperCase()}
              </span>
              <span aria-hidden="true">·</span>
              <span>{routePreview.recommended_agent}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {(routePreview.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeAsk(inputQuestion);
            }}
            className="flex items-end gap-2.5"
          >
            <label htmlFor="assistant-chat-textarea" className="sr-only">
              Message your documents
            </label>
            <textarea
              id="assistant-chat-textarea"
              rows={1}
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  executeAsk(inputQuestion);
                }
              }}
              placeholder={`Ask anything about ${selectedDocObj?.filename || 'your documents'} in plain English... (e.g., "What is this doc about?", "Explain Team 1", "Give me an analogy")`}
              className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090A0F] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              type="submit"
              disabled={!inputQuestion.trim() || isSending}
              aria-label="Send question"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Optional Side-by-Side Interactive Document Reader Panel */}
      {showReaderSplit && (
        <aside
          aria-label="Side-by-Side Document Reader"
          className="w-full lg:w-[430px] shrink-0 flex flex-col rounded-xl border border-[#C7D2FE] dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden max-h-96 lg:max-h-full shadow-2xs"
        >
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-[#EEF2FF]/60 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {selectedDocObj?.filename || 'Document Reader'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowReaderSplit(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>

            {highlightedCitation && (
              <div className="rounded-lg bg-[#FEF3C7] dark:bg-amber-950/40 border border-[#FCD34D] dark:border-amber-700/60 px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#92400E] dark:text-amber-200">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    Highlighted Citation: Page {highlightedCitation.pageNumber}
                    {highlightedCitation.endPageNumber
                      ? `–${highlightedCitation.endPageNumber}`
                      : ''}
                    {highlightedCitation.sectionTitle
                      ? ` · ${highlightedCitation.sectionTitle}`
                      : ''}
                  </div>
                  <div className="text-[11px] opacity-85 truncate">
                    Scrolled to matching document passage below
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHighlightedCitation(null)}
                  className="px-2 py-0.5 rounded bg-white/90 dark:bg-slate-900 border border-[#FCD34D] text-[10px] font-semibold text-[#92400E] hover:bg-white cursor-pointer shrink-0"
                >
                  Clear
                </button>
              </div>
            )}

            <input
              type="text"
              value={readerFilterText}
              onChange={(e) => setReaderFilterText(e.target.value)}
              placeholder="Search pages or teams (e.g., Team 4, Page 2)..."
              className="w-full rounded-md border border-[#C7D2FE] dark:border-slate-700 bg-white dark:bg-[#0B0D13] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            />
          </div>

          <div
            ref={readerScrollContainerRef}
            className="flex-1 overflow-y-auto p-3 space-y-2.5"
          >
            {filteredReaderChunks.map((chunk) => {
              const cleanText = cleanChunkExcerpt(chunk.text);
              const isChunkHighlighted =
                highlightedCitation !== null &&
                (highlightedCitation.chunkId === chunk.chunk_id ||
                  (!highlightedCitation.chunkId &&
                    (chunk.page_number === highlightedCitation.pageNumber ||
                      (highlightedCitation.endPageNumber !== undefined &&
                        chunk.page_number >= highlightedCitation.pageNumber &&
                        chunk.page_number <= highlightedCitation.endPageNumber))));

              return (
                <div
                  key={chunk.chunk_id}
                  data-reader-chunk-id={chunk.chunk_id}
                  data-reader-page={chunk.page_number}
                  data-highlighted={isChunkHighlighted ? 'true' : 'false'}
                  className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                    isChunkHighlighted
                      ? 'border-2 border-[#F59E0B] bg-[#FEF3C7]/65 dark:bg-amber-950/30 ring-2 ring-[#FDE68A] shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1017]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[11px] font-semibold truncate ${
                          isChunkHighlighted
                            ? 'text-[#92400E] dark:text-amber-300'
                            : 'text-[#312E81] dark:text-indigo-300'
                        }`}
                      >
                        Page {chunk.page_number} · {chunk.section_title}
                      </span>
                      {isChunkHighlighted && (
                        <span className="px-1.5 py-0.5 rounded bg-[#FDE68A] text-[#92400E] text-[10px] font-semibold whitespace-nowrap">
                          Cited Passage
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={() =>
                        executeAsk(
                          `Explain Page ${chunk.page_number} (${chunk.section_title}) in simple words.`,
                          chunk.document_id
                        )
                      }
                      className="px-2 py-0.5 rounded bg-[#EEF2FF] dark:bg-indigo-950/50 text-[10px] font-semibold text-[#312E81] dark:text-indigo-300 hover:bg-[#E0E7FF] cursor-pointer shrink-0"
                    >
                      Ask About This →
                    </button>
                  </div>
                  <p
                    className={`text-xs leading-relaxed whitespace-pre-line ${
                      isChunkHighlighted
                        ? 'text-slate-900 dark:text-slate-100 font-medium bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-[#FCD34D]'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cleanText}
                  </p>
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
};
