import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  LayoutDashboard,
  FileText,
  MessageSquare,
  Layers,
  GitCompare,
  Activity,
  Settings,
  ArrowRight,
  Globe,
  X,
  BookOpen,
  FolderGit2,
} from 'lucide-react';
import { DocumentItem } from '../lib/ragCore';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentItem[];
  onNavigateWorkspace: (
    view: 'overview' | 'documents' | 'assistant' | 'summaries' | 'compare' | 'analytics' | 'settings'
  ) => void;
  onOpenLanding: () => void;
  onOpenDriveModal?: () => void;
  onInspectDocument: (docId: string) => void;
  onAskQuestion: (question: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  documents,
  onNavigateWorkspace,
  onOpenLanding,
  onOpenDriveModal,
  onInspectDocument,
  onAskQuestion,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const quickActions = [
    ...(onOpenDriveModal
      ? [
          {
            id: 'google-drive',
            label: 'Connect Google Drive & Import Documents',
            category: 'Cloud Sync',
            icon: FolderGit2,
            action: () => {
              onOpenDriveModal();
              onClose();
            },
          },
        ]
      : []),
    {
      id: 'nav-overview',
      label: 'Go to Overview Dashboard',
      category: 'Navigation',
      icon: LayoutDashboard,
      action: () => {
        onNavigateWorkspace('overview');
        onClose();
      },
    },
    {
      id: 'nav-assistant',
      label: 'Open AI Document Assistant Chat',
      category: 'Navigation',
      icon: MessageSquare,
      action: () => {
        onNavigateWorkspace('assistant');
        onClose();
      },
    },
    {
      id: 'nav-documents',
      label: 'Manage Document Library & Upload Files',
      category: 'Navigation',
      icon: FileText,
      action: () => {
        onNavigateWorkspace('documents');
        onClose();
      },
    },
    {
      id: 'nav-summaries',
      label: 'Summarize Document or Explain Concept',
      category: 'Workflows',
      icon: Layers,
      action: () => {
        onNavigateWorkspace('summaries');
        onClose();
      },
    },
    {
      id: 'nav-compare',
      label: 'Compare Two Documents & Audit Conflicts',
      category: 'Workflows',
      icon: GitCompare,
      action: () => {
        onNavigateWorkspace('compare');
        onClose();
      },
    },
    {
      id: 'nav-analytics',
      label: 'Open RAG Pipeline & Retrieval Simulator',
      category: 'Observability',
      icon: Activity,
      action: () => {
        onNavigateWorkspace('analytics');
        onClose();
      },
    },
    {
      id: 'nav-landing',
      label: 'View Product Landing Page & Architecture Showcase',
      category: 'Product',
      icon: Globe,
      action: () => {
        onOpenLanding();
        onClose();
      },
    },
    {
      id: 'nav-settings',
      label: 'Workspace Settings & Health Telemetry',
      category: 'System',
      icon: Settings,
      action: () => {
        onNavigateWorkspace('settings');
        onClose();
      },
    },
  ].filter(
    (item) =>
      !q ||
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
  );

  const matchingDocs = documents.filter(
    (doc) =>
      !q ||
      doc.filename.toLowerCase().includes(q) ||
      doc.tags.some((t) => t.toLowerCase().includes(q))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/65 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-indigo-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                onAskQuestion(query.trim());
                onClose();
              }
            }}
            placeholder="Type a command, search indexed documents, or press Enter to ask AI..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80">
          {query.trim().length > 2 && (
            <div className="p-2">
              <button
                type="button"
                onClick={() => {
                  onAskQuestion(query.trim());
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-left text-xs font-medium text-indigo-600 dark:text-indigo-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Ask AI Assistant: "{query.trim()}"
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] shrink-0">
                  <span>Run /ask</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            </div>
          )}

          {quickActions.length > 0 && (
            <div className="p-2 space-y-1">
              <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Workspace Actions & Navigation
              </div>
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left text-xs text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="truncate font-medium">{item.label}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                      {item.category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {matchingDocs.length > 0 && (
            <div className="p-2 space-y-1">
              <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Indexed Documents ({matchingDocs.length})
              </div>
              {matchingDocs.map((doc) => (
                <button
                  key={doc.doc_id}
                  type="button"
                  onClick={() => {
                    onInspectDocument(doc.doc_id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left text-xs text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate font-medium">{doc.filename}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                    {doc.chunk_count} chunks · Inspect
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#0B0D13] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>Press Enter to ask AI · Esc to close</span>
          <span className="font-mono">Cmd+K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};
