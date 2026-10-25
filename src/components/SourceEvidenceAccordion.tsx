import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Copy, Check, ExternalLink } from 'lucide-react';
import { RetrievedContext } from '../lib/ragCore';

interface SourceEvidenceAccordionProps {
  contexts: RetrievedContext[];
  title?: string;
  defaultOpen?: boolean;
  onInspectDocument?: (docId: string) => void;
  onHighlightCitation?: (ctx: RetrievedContext) => void;
}

export const SourceEvidenceAccordion: React.FC<SourceEvidenceAccordionProps> = ({
  contexts,
  title = 'Sources and retrieved context',
  defaultOpen = false,
  onInspectDocument,
  onHighlightCitation,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  if (!contexts || contexts.length === 0) {
    return null;
  }

  const handleCopyExcerpt = (chunkId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(chunkId);
    setTimeout(() => setCopiedChunkId(null), 1800);
  };

  const uniqueDocs = Array.from(new Set(contexts.map((c) => c.filename)));

  return (
    <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-[#0D1017]">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-900/60 transition-colors rounded-lg cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0">
            {title}
          </span>
          <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
            ·
          </span>
          <span className="text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap shrink-0">
            {contexts.length} {contexts.length === 1 ? 'chunk' : 'chunks'}
          </span>
          <span aria-hidden="true" className="text-slate-400 dark:text-slate-600 hidden sm:inline">
            ·
          </span>
          <span className="text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
            {uniqueDocs.join(', ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 shrink-0">
          <span className="text-[11px]">{isOpen ? 'Hide evidence' : 'View evidence'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 dark:border-slate-800/90 divide-y divide-slate-200 dark:divide-slate-800/80">
          {contexts.map((ctx, idx) => (
            <div key={ctx.chunk_id || idx} className="p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    [{idx + 1}]
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {ctx.filename}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-semibold text-[#312E81] dark:text-indigo-300">
                    Page {ctx.page_number}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500 dark:text-slate-400">{ctx.section_title}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Relevance {(ctx.score * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onHighlightCitation && (
                    <button
                      type="button"
                      onClick={() => onHighlightCitation(ctx)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] text-[11px] font-semibold text-[#312E81] dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-200 cursor-pointer whitespace-nowrap"
                    >
                      <span>Highlight in Side-by-Side View</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {onInspectDocument && (
                    <button
                      type="button"
                      onClick={() => onInspectDocument(ctx.document_id)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      <span>Inspect doc</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyExcerpt(ctx.chunk_id, ctx.excerpt)}
                    aria-label={`Copy excerpt from ${ctx.filename} page ${ctx.page_number}`}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedChunkId === ctx.chunk_id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-normal bg-white/80 dark:bg-slate-900/60 p-2.5 rounded border border-slate-200/70 dark:border-slate-800/70">
                {ctx.excerpt}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
