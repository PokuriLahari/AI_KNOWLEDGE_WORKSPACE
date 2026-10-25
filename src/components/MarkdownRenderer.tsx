import React, { useState } from 'react';
import { Check, Copy, BookOpen } from 'lucide-react';

export interface InteractiveCitationRef {
  page: number;
  endPage?: number;
  section?: string;
  rawLabel: string;
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onCitationClick?: (citation: InteractiveCitationRef) => void;
}

export function parseCitationToken(rawToken: string): InteractiveCitationRef | null {
  const cleaned = rawToken.trim();
  const match = cleaned.match(
    /(?:page|pages|pp?\.?)\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(?:\s*[·|,]\s*([^)\]]+))?/i
  );
  if (!match) return null;
  const page = parseInt(match[1], 10);
  if (isNaN(page) || page < 1) return null;
  const endPage = match[2] ? parseInt(match[2], 10) : undefined;
  const section = match[3] ? match[3].trim() : undefined;
  return {
    page,
    endPage: endPage && !isNaN(endPage) ? endPage : undefined,
    section,
    rawLabel: cleaned,
  };
}

function renderTextWithCitations(
  segment: string,
  keyPrefix: string,
  onCitationClick?: (citation: InteractiveCitationRef) => void
): React.ReactNode[] {
  if (!onCitationClick || !segment) return [segment];

  // Match parenthetical or bracketed citations e.g. (Page 1), (Pages 2–3), (p. 6), [p. 1 · Overview], or standalone Page 6 / Pages 2–3
  const citRegex =
    /(\((?:[^()]*?\b(?:Pages?|pp?\.?)\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?[^()]*)\)|\[(?:[^\[\]]*?\b(?:Pages?|pp?\.?)\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?[^\[\]]*)\]|\b(?:Pages?|pp\.)\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)/gi;

  const parts = segment.split(citRegex);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (idx % 2 === 1) {
      const parsed = parseCitationToken(part);
      if (parsed) {
        return (
          <button
            key={`${keyPrefix}-cit-${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCitationClick(parsed);
            }}
            title={`Click to open Page ${parsed.page} in Side-by-Side Document Reader`}
            aria-label={`Open citation ${parsed.rawLabel} in side-by-side document reader`}
            className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md bg-[#EEF2FF] hover:bg-[#E0E7FF] dark:bg-indigo-950/60 dark:hover:bg-indigo-900/70 text-[#312E81] dark:text-indigo-200 border border-[#A5B4FC] dark:border-indigo-700 font-mono text-[11px] font-semibold transition-all cursor-pointer align-baseline shadow-2xs"
          >
            <BookOpen className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{part}</span>
          </button>
        );
      }
    }
    return <React.Fragment key={`${keyPrefix}-txt-${idx}`}>{part}</React.Fragment>;
  });
}

function renderInline(
  text: string,
  onCitationClick?: (citation: InteractiveCitationRef) => void
): React.ReactNode[] {
  // Normalize **`code`** or `**code**` to `code` so no raw backticks appear
  const normalized = text
    .replace(/\*\*`([^`]+)`\*\*/g, '`$1`')
    .replace(/`\*\*([^*]+)\*\*`/g, '`$1`');
  const tokens = normalized.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 text-[12px] font-mono font-semibold rounded bg-[#EEF2FF] dark:bg-slate-800/90 text-[#312E81] dark:text-indigo-300 border border-[#C7D2FE] dark:border-slate-700/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      const inner = token.slice(2, -2).replace(/`([^`]+)`/g, '$1');
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {renderTextWithCitations(inner, `b-${idx}`, onCitationClick)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      const inner = token.slice(1, -1).replace(/`([^`]+)`/g, '$1');
      return (
        <em key={idx} className="italic text-slate-700 dark:text-slate-300">
          {renderTextWithCitations(inner, `i-${idx}`, onCitationClick)}
        </em>
      );
    }
    return (
      <React.Fragment key={idx}>
        {renderTextWithCitations(token, `t-${idx}`, onCitationClick)}
      </React.Fragment>
    );
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[#C7D2FE] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#EEF2FF]/70 dark:bg-slate-900/90 border-b border-[#C7D2FE] dark:border-slate-800 text-xs font-mono text-[#312E81] dark:text-slate-400">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code snippet"
          className="flex items-center gap-1 text-[#4338CA] dark:text-slate-400 hover:text-[#312E81] dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

type ParsedBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'paragraph'; text: string };

function parseMarkdownBlocks(rawSegment: string): ParsedBlock[] {
  const lines = rawSegment.replace(/\r\n/g, '\n').split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      i++;
      continue;
    }

    // Headings (#, ##, ###, ####) — always single line!
    if (trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h4', text: trimmed.slice(5).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    // Table detection
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().includes('---') &&
      lines[i + 1].trim().includes('|')
    ) {
      const headers = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        const rowCells = lines[i]
          .trim()
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        if (rowCells.length > 0) {
          rows.push(rowCells);
        }
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    // Unordered list (- or * or •)
    if (/^([-*•])\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*•])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^(\s*[-*•])\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list (1. 2. etc.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const curr = lines[i].trim();
        if (/^\d+\.\s+/.test(curr)) {
          items.push(curr.replace(/^\d+\.\s+/, '').trim());
          i++;
        } else if (
          curr.length > 0 &&
          !curr.startsWith('#') &&
          !curr.startsWith('>') &&
          !/^([-*•])\s+/.test(curr) &&
          lines[i].startsWith('  ') &&
          items.length > 0
        ) {
          // Indented continuation of previous numbered list item
          items[items.length - 1] += ' ' + curr;
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Regular paragraph: collect consecutive non-special lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const curr = lines[i].trim();
      if (
        !curr ||
        curr.startsWith('#') ||
        curr.startsWith('>') ||
        /^([-*•])\s+/.test(curr) ||
        /^\d+\.\s+/.test(curr) ||
        /^---+$/.test(curr) ||
        (curr.includes('|') &&
          i + 1 < lines.length &&
          lines[i + 1].trim().includes('---'))
      ) {
        break;
      }
      paraLines.push(curr);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    } else {
      i++;
    }
  }

  return blocks;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  onCitationClick,
}) => {
  if (!content) return null;

  // Split by fenced code blocks first
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className={`space-y-3 text-[14.5px] leading-relaxed text-slate-700 dark:text-slate-300 ${className}`}>
      {segments.map((seg, segIdx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const lines = seg.slice(3, -3).trim().split('\n');
          const firstLine = lines[0]?.trim() || '';
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const lang = hasLang ? firstLine : 'code';
          const codeBody = hasLang ? lines.slice(1).join('\n') : lines.join('\n');
          return <CodeBlock key={segIdx} code={codeBody} lang={lang} />;
        }

        const blocks = parseMarkdownBlocks(seg);
        return (
          <React.Fragment key={segIdx}>
            {blocks.map((block, bIdx) => {
              if (block.type === 'table') {
                return (
                  <div
                    key={bIdx}
                    className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#EEF2FF]/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
                          {block.headers.map((h, hIdx) => (
                            <th
                              key={hIdx}
                              className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-200"
                            >
                              {renderInline(h, onCitationClick)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                        {block.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="py-2 px-3 text-slate-700 dark:text-slate-300 tabular-nums"
                              >
                                {renderInline(cell, onCitationClick)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              if (block.type === 'h4') {
                return (
                  <h4
                    key={bIdx}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-2"
                  >
                    {renderInline(block.text, onCitationClick)}
                  </h4>
                );
              }
              if (block.type === 'h3') {
                return (
                  <h3
                    key={bIdx}
                    className="text-base font-semibold text-slate-900 dark:text-slate-100 pt-2"
                  >
                    {renderInline(block.text, onCitationClick)}
                  </h3>
                );
              }
              if (block.type === 'h2' || block.type === 'h1') {
                return (
                  <h2
                    key={bIdx}
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100 pt-2"
                  >
                    {renderInline(block.text, onCitationClick)}
                  </h2>
                );
              }

              if (block.type === 'blockquote') {
                return (
                  <blockquote
                    key={bIdx}
                    className="p-3.5 rounded-xl bg-[#EEF2FF]/65 dark:bg-slate-900/70 border border-[#C7D2FE] dark:border-slate-800 text-[13.5px] text-[#312E81] dark:text-slate-200 leading-relaxed"
                  >
                    {renderInline(block.lines.join(' '), onCitationClick)}
                  </blockquote>
                );
              }

              if (block.type === 'ul') {
                return (
                  <ul key={bIdx} className="space-y-1.5 pl-5 list-disc">
                    {block.items.map((item, lIdx) => (
                      <li key={lIdx} className="text-slate-700 dark:text-slate-300 break-words leading-relaxed">
                        {renderInline(item, onCitationClick)}
                      </li>
                    ))}
                  </ul>
                );
              }

              if (block.type === 'ol') {
                return (
                  <ol key={bIdx} className="space-y-2 pl-5 list-decimal">
                    {block.items.map((item, lIdx) => (
                      <li key={lIdx} className="text-slate-700 dark:text-slate-300 break-words leading-relaxed">
                        {renderInline(item, onCitationClick)}
                      </li>
                    ))}
                  </ol>
                );
              }

              if (block.type === 'paragraph') {
                return (
                  <p key={bIdx} className="leading-relaxed break-words">
                    {renderInline(block.text, onCitationClick)}
                  </p>
                );
              }
              return null;
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};

