/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Layers,
  GitCompare,
  Activity,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Command,
  FolderGit2,
  ShieldAlert,
  Network,
  GraduationCap,
  BarChart3,
  Mic,
} from 'lucide-react';
import {
  HealthResponse,
  DocumentItem,
  ConversationSession,
} from './lib/ragCore';
import { workspaceApi } from './lib/apiClient';
import {
  GoogleUserProfile,
  initAuth,
  googleSignIn,
  logout,
} from './lib/googleWorkspace';
import { OverviewView } from './components/OverviewView';
import { DocumentsView } from './components/DocumentsView';
import { AssistantChatView } from './components/AssistantChatView';
import { SummariesExplainView } from './components/SummariesExplainView';
import { CompareDocumentsView } from './components/CompareDocumentsView';
import { PipelineAnalyticsView } from './components/PipelineAnalyticsView';
import { SettingsView } from './components/SettingsView';
import { LandingPageView } from './components/LandingPageView';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { AmbientBackgroundCanvas } from './components/AmbientBackgroundCanvas';
import { OpeningIntroOverlay } from './components/OpeningIntroOverlay';
import {
  IntelligenceSuiteView,
  IntelligenceModuleId,
} from './components/IntelligenceSuiteView';

export type ActiveView =
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
  | 'analytics'
  | 'settings';

interface ToastNotification {
  id: string;
  type: 'success' | 'error';
  message: string;
}

export default function App() {
  // Support ?autostart=1 or ?workspace=1 query param to jump straight to workspace
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('workspace') === '1') {
        return false;
      }
    }
    return true;
  });

  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Default to high-craft light theme per user preference
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Google Workspace Auth & Google Drive Connector State
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState<boolean>(true);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState<boolean>(false);
  const [driveModalOpen, setDriveModalOpen] = useState<boolean>(false);

  // Nano Banana & Omni Flash Motion Studio State
  const [showOpeningIntro, setShowOpeningIntro] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (
        params.get('skipIntro') === '1' ||
        params.get('autostart') === '1' ||
        params.get('workspace') === '1'
      ) {
        return false;
      }
    }
    return true;
  });

  // Backend data state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Cross-view workflow handoff states
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [pendingChatQuestion, setPendingChatQuestion] = useState<string | null>(
    null
  );
  const [pendingChatDocId, setPendingChatDocId] = useState<string | null>(null);
  const [pendingInspectDocId, setPendingInspectDocId] = useState<string | null>(
    null
  );
  const [pendingSummaryDocId, setPendingSummaryDocId] = useState<string | null>(
    null
  );
  const [pendingExplainConcept, setPendingExplainConcept] = useState<
    string | null
  >(null);

  // Top bar quick search / command state
  const [topSearchInput, setTopSearchInput] = useState('');

  // Toast notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Initialize Firebase Google Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
        });
        setNeedsGoogleAuth(false);
      },
      () => {
        setGoogleUser(null);
        setNeedsGoogleAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningInGoogle(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser({
          uid: result.user.uid,
          displayName: result.user.displayName,
          email: result.user.email,
          photoURL: result.user.photoURL,
        });
        setNeedsGoogleAuth(false);
        setDriveModalOpen(true);
        addToast(
          'success',
          `Connected Google Drive as ${
            result.user.displayName || result.user.email
          }.`
        );
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        addToast(
          'error',
          err?.message || 'Google Sign-In could not be completed.'
        );
      }
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setGoogleUser(null);
    setNeedsGoogleAuth(true);
    addToast('success', 'Disconnected from Google Workspace.');
  };

  // Global Cmd+K / Ctrl+K keyboard shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchHealth = useCallback(async () => {
    const h = await workspaceApi.getHealth();
    setHealth(h);
    setBackendError(null);
  }, []);

  const fetchDocuments = useCallback(async () => {
    const res = await workspaceApi.getDocuments();
    setDocuments(res.documents);
    setTotalChunks(res.total_chunks);
  }, []);

  const fetchSessions = useCallback(async () => {
    const res = await workspaceApi.getSessions();
    setSessions(res.sessions);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadWorkspace() {
      setIsLoadingInitial(true);
      try {
        await Promise.all([fetchHealth(), fetchDocuments(), fetchSessions()]);
      } catch (err: any) {
        if (mounted) {
          setBackendError(
            err?.message || 'Unable to connect to workspace backend API.'
          );
        }
      } finally {
        if (mounted) setIsLoadingInitial(false);
      }
    }
    loadWorkspace();
    return () => {
      mounted = false;
    };
  }, [fetchHealth, fetchDocuments, fetchSessions]);

  const handleStartNewConversation = () => {
    setShowLanding(false);
    setActiveSessionId(null);
    setPendingChatQuestion(null);
    setPendingChatDocId(null);
    setActiveView('assistant');
    setMobileMenuOpen(false);
  };

  const handleAskQuestionFromOverview = (
    question: string,
    docId?: string | null
  ) => {
    setShowLanding(false);
    setActiveSessionId(null);
    setPendingChatQuestion(question);
    setPendingChatDocId(docId || null);
    setActiveView('assistant');
  };

  const handleInspectDocument = (docId: string) => {
    setShowLanding(false);
    setPendingInspectDocId(docId);
    setActiveView('documents');
  };

  const handleQuickSummarize = (docId: string) => {
    setShowLanding(false);
    setPendingSummaryDocId(docId);
    setActiveView('summaries');
  };

  const handleQuickExplain = (concept: string) => {
    setShowLanding(false);
    setPendingExplainConcept(concept);
    setActiveView('summaries');
  };

  const handleTopSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = topSearchInput.trim();
    if (!q) return;
    setTopSearchInput('');
    handleAskQuestionFromOverview(q, null);
  };

  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'documents',
      label: 'Documents',
      icon: FileText,
      count: documents.length,
    },
    { id: 'assistant', label: 'AI Assistant', icon: MessageSquare },
    { id: 'summaries', label: 'Summaries', icon: Layers },
    { id: 'compare', label: 'Compare Documents', icon: GitCompare },
    { id: 'radar', label: 'Contradiction Radar', icon: ShieldAlert },
    { id: 'graph', label: 'Knowledge Graph', icon: Network },
    { id: 'study', label: 'Study & Quiz Mode', icon: GraduationCap },
    { id: 'extractor', label: 'Table & Chart Extractor', icon: BarChart3 },
    { id: 'podcast', label: 'AI Podcast Studio', icon: Mic },
    { id: 'analytics', label: 'RAG Analytics', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const viewTitleMap: Record<ActiveView, string> = {
    overview: 'Overview Dashboard',
    documents: 'Document Library',
    assistant: 'AI Assistant',
    summaries: 'Summaries & Explanations',
    compare: 'Compare Documents',
    radar: 'Contradiction & Red-Flag Radar',
    graph: 'Interactive Visual Knowledge Graph',
    study: 'Study & Exam Mode (Flashcards & Quiz)',
    extractor: 'Smart Data Table & Chart Extractor',
    podcast: 'Two-Host AI Podcast Studio',
    analytics: 'RAG Pipeline & Vector Analytics',
    settings: 'Workspace Settings',
  };

  return (
    <>
      {/* Choreographed Opening Intro Animation Overlay */}
      <OpeningIntroOverlay
        isOpen={showOpeningIntro}
        onComplete={() => setShowOpeningIntro(false)}
      />

      {/* Live 60fps Ambient Background Canvas */}
      <AmbientBackgroundCanvas preset="constellation" theme={theme} />

      {showLanding ? (
        <LandingPageView
          health={health}
          documents={documents}
          totalChunks={totalChunks}
          theme={theme}
          onToggleTheme={() =>
            setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
          }
          googleUser={googleUser}
          isSigningInGoogle={isSigningInGoogle}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onOpenDriveModal={() => setDriveModalOpen(true)}
          onEnterWorkspace={(targetView) => {
            if (targetView) {
              setActiveView(targetView);
            }
            setShowLanding(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onRunLiveQueryInWorkspace={(question) => {
            handleAskQuestionFromOverview(question, null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onNotify={addToast}
        />
      ) : (
        <div className="relative z-10 min-h-screen flex bg-transparent text-slate-900 dark:text-slate-100 transition-colors duration-200">
          {/* Mobile Sidebar Backdrop */}
          {mobileMenuOpen && (
            <div
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
            />
          )}

          {/* Left Workspace Sidebar */}
          <aside
            aria-label="Primary Workspace Navigation"
            className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0D0F17] transition-all duration-200 ease-out ${
              mobileMenuOpen
                ? 'translate-x-0'
                : '-translate-x-full lg:translate-x-0'
            } ${sidebarCollapsed ? 'lg:w-[68px]' : 'w-64'}`}
          >
            {/* Product Brand Header */}
            <div className="h-14 px-3.5 border-b border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveView('overview');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-[#E0E7FF] border border-[#C7D2FE] flex items-center justify-center text-[#312E81] font-semibold text-xs shrink-0 shadow-xs">
                  KW
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
                    Knowledge Workspace
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={
                  sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden lg:inline-flex p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* New Conversation & Google Drive Actions */}
            <div className="p-3 shrink-0 space-y-2">
              <button
                type="button"
                onClick={handleStartNewConversation}
                title="Start a new AI conversation"
                className={`w-full flex items-center justify-center gap-2 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] border border-[#C7D2FE] text-[#312E81] text-xs font-semibold py-2 px-3 transition-colors cursor-pointer shadow-2xs ${
                  sidebarCollapsed ? 'px-0' : ''
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="whitespace-nowrap">New Conversation</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDriveModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                title="Connect Google Drive & Import Documents"
                className={`w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-500/10 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-semibold py-2 px-3 transition-colors cursor-pointer ${
                  sidebarCollapsed ? 'px-0' : ''
                }`}
              >
                <FolderGit2 className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="whitespace-nowrap truncate">
                    {googleUser ? 'Google Drive Connected' : 'Connect Google Drive'}
                  </span>
                )}
              </button>
            </div>

            {/* Primary Navigation Links */}
            <nav className="px-2.5 space-y-1 flex-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : ''
                        }`}
                      />
                      {!sidebarCollapsed && (
                        <span className="truncate whitespace-nowrap">
                          {item.label}
                        </span>
                      )}
                    </div>
                    {!sidebarCollapsed && item.count !== undefined && (
                      <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Switch to Product Landing Page */}
              <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800/70 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowLanding(true);
                    setMobileMenuOpen(false);
                  }}
                  title="View Product Landing Page"
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <Globe className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  {!sidebarCollapsed && (
                    <span className="truncate whitespace-nowrap">
                      Product Landing Page
                    </span>
                  )}
                </button>
              </div>

              {/* Recent Conversations Section in Sidebar */}
              {!sidebarCollapsed && sessions.length > 0 && (
                <div className="pt-4 pb-2 space-y-1.5">
                  <div className="px-2.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    Recent Conversations
                  </div>
                  {sessions.slice(0, 5).map((sess) => {
                    const isSelected =
                      activeView === 'assistant' &&
                      activeSessionId === sess.session_id;
                    return (
                      <button
                        key={sess.session_id}
                        type="button"
                        onClick={() => {
                          setActiveSessionId(sess.session_id);
                          setActiveView('assistant');
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <Clock className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="truncate">{sess.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </nav>

            {/* User Profile & Theme Toggle Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {googleUser?.photoURL ? (
                  <img
                    src={googleUser.photoURL}
                    alt={googleUser.displayName || 'Google User'}
                    className="w-7 h-7 rounded-full object-cover border border-indigo-300 dark:border-indigo-500/40 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-indigo-700 dark:text-slate-300 shrink-0">
                    {googleUser
                      ? (
                          googleUser.displayName ||
                          googleUser.email ||
                          'G'
                        )
                          .charAt(0)
                          .toUpperCase()
                      : 'DS'}
                  </div>
                )}
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {googleUser
                        ? googleUser.displayName || googleUser.email
                        : 'Workspace Architect'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {googleUser
                        ? 'Google Drive Connected'
                        : health?.model || 'gemini-3.8-flash'}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
                }
                aria-label={
                  theme === 'dark'
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
                }
                title={
                  theme === 'dark'
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
                }
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top Navigation Bar (Strict 3-Zone SaaS Contract) */}
            <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/90 bg-white/90 dark:bg-[#0D0F17]/90 backdrop-blur-xs flex items-center justify-between gap-4 sticky top-0 z-30">
              {/* Zone 1: Mobile Menu Trigger + Breadcrumb Trail */}
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open navigation sidebar"
                  className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <Menu className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 text-xs whitespace-nowrap truncate">
                  <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                    Knowledge Workspace
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-slate-300 dark:text-slate-700 hidden sm:inline"
                  >
                    /
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {viewTitleMap[activeView]}
                  </span>
                </div>
              </div>

              {/* Zone 2: Quick Workspace Search / Ask Bar + Command Palette Trigger */}
              <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
                <form onSubmit={handleTopSearchSubmit} className="flex-1 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <label htmlFor="top-workspace-search" className="sr-only">
                    Ask your documents or search workspace
                  </label>
                  <input
                    id="top-workspace-search"
                    type="text"
                    value={topSearchInput}
                    onChange={(e) => setTopSearchInput(e.target.value)}
                    placeholder="Ask any question across indexed documents..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090A0F] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </form>
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  aria-label="Open command palette"
                  title="Open Command Palette (Cmd+K / Ctrl+K)"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090A0F] hover:border-indigo-500/40 text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer shrink-0"
                >
                  <Command className="w-3 h-3" />
                  <span>K</span>
                </button>
              </div>

              {/* Zone 3: Google Auth / Drive Connector & Upload Action */}
              <div className="flex items-center gap-2 shrink-0">
                <GoogleSignInButton
                  user={googleUser}
                  isSigningIn={isSigningInGoogle}
                  onSignIn={handleGoogleSignIn}
                  onOpenDriveModal={() => setDriveModalOpen(true)}
                  onSignOut={handleGoogleSignOut}
                />

                <button
                  type="button"
                  onClick={() => setActiveView('documents')}
                  className="px-3 py-1.5 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] border border-[#C7D2FE] text-[#312E81] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                >
                  Upload Document
                </button>
              </div>
            </header>

            {/* Backend Unavailability Warning Banner (Only shown if backend fails) */}
            {backendError && (
              <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-rose-600 dark:text-rose-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Backend API Connection Issue: {backendError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    fetchHealth();
                    fetchDocuments();
                  }}
                  className="underline font-medium cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            )}

            {/* Active View Workspace with Smooth Animated Transitions */}
            <main className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeView === 'overview' && (
                    <OverviewView
                      health={health}
                      documents={documents}
                      totalChunks={totalChunks}
                      sessions={sessions}
                      isLoading={isLoadingInitial}
                      onNavigate={(v) => setActiveView(v)}
                      onAskQuestion={handleAskQuestionFromOverview}
                      onSelectSession={(sid) => {
                        setActiveSessionId(sid);
                        setActiveView('assistant');
                      }}
                      onInspectDocument={handleInspectDocument}
                      onDocumentUploaded={async () => {
                        await Promise.all([fetchDocuments(), fetchHealth()]);
                      }}
                      onQuickSummarize={handleQuickSummarize}
                      onQuickExplain={handleQuickExplain}
                      onOpenDriveModal={() => setDriveModalOpen(true)}
                      onNotify={addToast}
                    />
                  )}

                  {activeView === 'documents' && (
                    <DocumentsView
                      documents={documents}
                      totalChunks={totalChunks}
                      initialInspectDocId={pendingInspectDocId}
                      onClearInspectDocId={() => setPendingInspectDocId(null)}
                      onRefreshDocuments={async () => {
                        await Promise.all([fetchDocuments(), fetchHealth()]);
                      }}
                      onAskDocument={(docId) => {
                        setActiveSessionId(null);
                        setPendingChatDocId(docId);
                        setActiveView('assistant');
                      }}
                      onSummarizeDocument={handleQuickSummarize}
                      onOpenDriveModal={() => setDriveModalOpen(true)}
                      onNotify={addToast}
                    />
                  )}

                  {activeView === 'assistant' && (
                    <AssistantChatView
                      documents={documents}
                      sessions={sessions}
                      activeSessionId={activeSessionId}
                      initialQuestion={pendingChatQuestion}
                      initialDocFilter={pendingChatDocId}
                      onClearInitialPrompt={() => {
                        setPendingChatQuestion(null);
                        setPendingChatDocId(null);
                      }}
                      onSelectSession={(sid) => setActiveSessionId(sid)}
                      onRefreshSessions={fetchSessions}
                      onInspectDocument={handleInspectDocument}
                      onNotify={addToast}
                    />
                  )}

                  {activeView === 'summaries' && (
                    <SummariesExplainView
                      documents={documents}
                      initialMode={
                        pendingExplainConcept ? 'explain' : 'summarize'
                      }
                      initialDocId={pendingSummaryDocId}
                      initialConcept={pendingExplainConcept}
                      onClearInitial={() => {
                        setPendingSummaryDocId(null);
                        setPendingExplainConcept(null);
                      }}
                      onInspectDocument={handleInspectDocument}
                      onNotify={addToast}
                    />
                  )}

                  {activeView === 'compare' && (
                    <CompareDocumentsView
                      documents={documents}
                      onInspectDocument={handleInspectDocument}
                      onNotify={addToast}
                    />
                  )}

                  {(activeView === 'radar' ||
                    activeView === 'graph' ||
                    activeView === 'study' ||
                    activeView === 'extractor' ||
                    activeView === 'podcast') && (
                    <IntelligenceSuiteView
                      activeModule={activeView as IntelligenceModuleId}
                      onSelectModule={(mod) => setActiveView(mod)}
                      documents={documents}
                      onInspectDocument={handleInspectDocument}
                      onExplainConcept={handleQuickExplain}
                      onAskQuestion={handleAskQuestionFromOverview}
                      onNotify={addToast}
                    />
                  )}

                  {activeView === 'analytics' && (
                    <PipelineAnalyticsView
                      health={health}
                      documents={documents}
                      totalChunks={totalChunks}
                      onInspectDocument={handleInspectDocument}
                      onAskQuestion={handleAskQuestionFromOverview}
                      onNotify={addToast}
                    />
                  )}

                  {activeView === 'settings' && (
                    <SettingsView
                      health={health}
                      theme={theme}
                      onToggleTheme={() =>
                        setTheme((prev) =>
                          prev === 'dark' ? 'light' : 'dark'
                        )
                      }
                      onRefreshHealth={fetchHealth}
                      onNotify={addToast}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      )}

      {/* Global Google Drive Connector & File Importer Modal */}
      <GoogleDriveModal
        isOpen={driveModalOpen}
        onClose={() => setDriveModalOpen(false)}
        user={googleUser}
        needsAuth={needsGoogleAuth}
        isSigningIn={isSigningInGoogle}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        onRequireReauth={() => setNeedsGoogleAuth(true)}
        indexedFilenames={documents.map((d) => d.filename)}
        onDocumentImported={async () => {
          await Promise.all([fetchDocuments(), fetchHealth()]);
        }}
        onNotify={addToast}
      />

      {/* Global Command Palette Modal (Cmd+K / Ctrl+K) */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        documents={documents}
        onNavigateWorkspace={(view) => {
          setShowLanding(false);
          setActiveView(view);
        }}
        onOpenLanding={() => {
          setShowLanding(true);
        }}
        onOpenDriveModal={() => setDriveModalOpen(true)}
        onInspectDocument={handleInspectDocument}
        onAskQuestion={(q) => handleAskQuestionFromOverview(q, null)}
      />

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        >
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg text-xs font-medium ${
                t.type === 'success'
                  ? 'bg-white dark:bg-[#141824] border-emerald-500/40 text-slate-900 dark:text-slate-100'
                  : 'bg-white dark:bg-[#141824] border-rose-500/40 text-rose-600 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <span>{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((item) => item.id !== t.id))
                }
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
