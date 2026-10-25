import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Upload,
  Search,
  FileText,
  FileSpreadsheet,
  FileCode,
  Trash2,
  Eye,
  MessageSquare,
  Layers,
  CheckCircle2,
  X,
  Plus,
  FolderOpen,
  AlertTriangle,
  FolderGit2,
} from 'lucide-react';
import {
  DocumentItem,
  DocumentChunk,
  SupportedFileExtension,
  validateUploadFile,
} from '../lib/ragCore';
import { workspaceApi, formatBytes, formatRelativeTime } from '../lib/apiClient';

interface DocumentsViewProps {
  documents: DocumentItem[];
  totalChunks: number;
  initialInspectDocId?: string | null;
  onClearInspectDocId?: () => void;
  onRefreshDocuments: () => Promise<void>;
  onAskDocument: (docId: string, defaultPrompt?: string) => void;
  onSummarizeDocument: (docId: string) => void;
  onOpenDriveModal?: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  totalChunks,
  initialInspectDocId,
  onClearInspectDocId,
  onRefreshDocuments,
  onAskDocument,
  onSummarizeDocument,
  onOpenDriveModal,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SupportedFileExtension>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Quick Text/Spec Document Composer Modal
  const [showTextComposer, setShowTextComposer] = useState(false);
  const [customFilename, setCustomFilename] = useState('Production_SLA_Runbook_2026.txt');
  const [customContent, setCustomContent] = useState(
    `[Page 1]\n# 1.1 Production Vector Cluster SLA & Failover Protocol\nAll primary ChromaDB vector nodes operate in active-active replication across us-east-1 and eu-central-1. Automatic failover triggers within 8 seconds if heartbeat probes exceed 400ms.\n\n[Page 2]\n# 1.2 Backup & Recovery Point Objective (RPO)\nIncremental WAL snapshots of the SQLite metadata registry and HNSW vector segments are streamed to encrypted object storage every 15 minutes, guaranteeing an RPO of 15 minutes and an RTO of under 5 minutes.`
  );
  const [isSubmittingCustom, setIsSubmittingCustom] = useState(false);

  // Document Detail & Chunk Inspector state
  const [inspectDoc, setInspectDoc] = useState<DocumentItem | null>(null);
  const [inspectChunks, setInspectChunks] = useState<DocumentChunk[]>([]);
  const [isLoadingInspector, setIsLoadingInspector] = useState(false);
  const [chunkSearch, setChunkSearch] = useState('');

  // Delete confirmation modal state
  const [docToDelete, setDocToDelete] = useState<DocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialInspectDocId) {
      handleInspectDocument(initialInspectDocId);
      onClearInspectDocId?.();
    }
  }, [initialInspectDocId]);

  const handleInspectDocument = async (docId: string) => {
    setIsLoadingInspector(true);
    setChunkSearch('');
    try {
      const detail = await workspaceApi.getDocumentDetail(docId);
      setInspectDoc(detail.document);
      setInspectChunks(detail.chunks);
    } catch (err: any) {
      onNotify('error', err?.message || 'Could not load document chunks.');
    } finally {
      setIsLoadingInspector(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const validation = validateUploadFile(file.name, file.size);
    if (!validation.valid) {
      onNotify('error', validation.error || 'Invalid file format or size.');
      return;
    }

    try {
      setUploadingName(file.name);
      setUploadProgress(20);
      const res = await workspaceApi.uploadDocument(file, (pct) => setUploadProgress(pct));
      await onRefreshDocuments();
      onNotify('success', res.message);
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to index document.');
    } finally {
      setUploadingName(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateCustomDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customFilename.trim();
    const cleanBody = customContent.trim();
    if (!cleanName || !cleanBody) {
      onNotify('error', 'Both filename and document content are required.');
      return;
    }
    const byteLen = new Blob([cleanBody]).size;
    const validation = validateUploadFile(cleanName, byteLen);
    if (!validation.valid) {
      onNotify('error', validation.error || 'Invalid filename extension.');
      return;
    }

    try {
      setIsSubmittingCustom(true);
      const fileObj = new File([cleanBody], cleanName, { type: 'text/plain' });
      const res = await workspaceApi.uploadDocument(fileObj);
      await onRefreshDocuments();
      setShowTextComposer(false);
      onNotify('success', res.message);
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to index custom document.');
    } finally {
      setIsSubmittingCustom(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!docToDelete) return;
    try {
      setIsDeleting(true);
      const res = await workspaceApi.deleteDocument(docToDelete.doc_id);
      if (inspectDoc?.doc_id === docToDelete.doc_id) {
        setInspectDoc(null);
        setInspectChunks([]);
      }
      setDocToDelete(null);
      await onRefreshDocuments();
      onNotify(
        'success',
        `Deleted "${res.filename}" and removed ${res.chunks_removed} indexed chunks.`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesType = typeFilter === 'all' || doc.file_type === typeFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.summary_preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const renderFileTypeIcon = (ext: SupportedFileExtension) => {
    if (ext === 'csv') return <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (ext === 'txt') return <FileCode className="w-4 h-4 text-sky-500 shrink-0" />;
    return <FileText className="w-4 h-4 text-indigo-500 shrink-0" />;
  };

  const filteredInspectorChunks = inspectChunks.filter(
    (c) =>
      !chunkSearch.trim() ||
      c.text.toLowerCase().includes(chunkSearch.toLowerCase()) ||
      c.section_title.toLowerCase().includes(chunkSearch.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
    >
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Document Library & Vector Index
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload, inspect, and manage enterprise documents indexed in ChromaDB and SQLite ({documents.length} files · {totalChunks} chunks)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenDriveModal && (
            <button
              type="button"
              onClick={onOpenDriveModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/90 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Connect Google Drive</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowTextComposer((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] hover:bg-slate-50 dark:hover:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-500" />
            <span>Compose Spec Document</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
        </div>
      </div>

      {/* Optional Direct Text/Spec Document Composer */}
      {showTextComposer && (
        <form
          onSubmit={handleCreateCustomDocument}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Index Custom Document Content
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Create and index a structured `.txt` or `.csv` specification directly via `POST /index`
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTextComposer(false)}
              aria-label="Close document composer"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="custom-doc-filename"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Filename (PDF, DOCX, PPTX, TXT, CSV)
              </label>
              <input
                id="custom-doc-filename"
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="custom-doc-content"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Document Text Content (Use `[Page N]` or `# Section` markers for page/section metadata)
            </label>
            <textarea
              id="custom-doc-content"
              rows={5}
              value={customContent}
              onChange={(e) => setCustomContent(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] p-3 text-xs text-slate-900 dark:text-slate-100 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowTextComposer(false)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCustom}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {isSubmittingCustom ? 'Indexing...' : 'Index Document Now'}
            </button>
          </div>
        </form>
      )}

      {/* Drag and Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileUpload(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed p-6 transition-colors ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-[#11141D]'
        }`}
      >
        <input
          ref={fileInputRef}
          id="library-file-upload-input"
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.csv"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="sr-only"
        />
        {uploadingName ? (
          <div className="max-w-md mx-auto text-center space-y-2.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Chunking & Generating Embeddings for "{uploadingName}"...
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-500 tabular-nums">
              {uploadProgress}% · Sentence Transformers + ChromaDB
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Drag and drop documents to index into the workspace
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Accepted formats: PDF, DOCX, PPTX, TXT, CSV · Maximum file size: 25 MB per file
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Select File from Computer
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            aria-label="Filter documents by filename or content"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by filename, topic, or excerpt..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        {/* Interactive Format Filter Tabs (Functional Buttons) */}
        <div
          role="group"
          aria-label="Filter documents by file format"
          className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#11141D] border border-slate-200 dark:border-slate-800 overflow-x-auto"
        >
          {(['all', 'pdf', 'docx', 'csv', 'txt', 'pptx'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setTypeFilter(fmt)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                typeFilter === fmt
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {fmt === 'all' ? `All (${documents.length})` : fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Main High-Density Document Table + Optional Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={`${
            inspectDoc ? 'lg:col-span-7' : 'lg:col-span-12'
          } rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden`}
        >
          {filteredDocs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <FolderOpen className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No matching documents found
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Try clearing your search filter or upload a new document above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 font-medium">Document Name</th>
                    {!inspectDoc && <th className="py-3 px-3 font-medium">Status</th>}
                    {!inspectDoc && <th className="py-3 px-3 font-medium text-right">Size</th>}
                    {!inspectDoc && <th className="py-3 px-3 font-medium text-right">Pages</th>}
                    <th className="py-3 px-3 font-medium text-right">Chunks</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                  {filteredDocs.map((doc) => {
                    const isSelected = inspectDoc?.doc_id === doc.doc_id;
                    return (
                      <tr
                        key={doc.doc_id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/25'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-2.5 min-w-[180px]">
                            <div className="mt-0.5">{renderFileTypeIcon(doc.file_type)}</div>
                            <div className="space-y-0.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleInspectDocument(doc.doc_id)}
                                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 text-left truncate max-w-[230px] sm:max-w-[300px] block cursor-pointer"
                                title={doc.filename}
                              >
                                {doc.filename}
                              </button>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                                <span className="uppercase font-mono">{doc.file_type}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatRelativeTime(doc.indexed_at)}</span>
                                {!inspectDoc && doc.tags.length > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{doc.tags.join(' / ')}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        {!inspectDoc && (
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="capitalize">{doc.status}</span>
                            </span>
                          </td>
                        )}
                        {!inspectDoc && (
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {formatBytes(doc.file_size_bytes)}
                          </td>
                        )}
                        {!inspectDoc && (
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {doc.page_count}
                          </td>
                        )}
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {doc.chunk_count}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleInspectDocument(doc.doc_id)}
                              aria-label={`Inspect ${doc.filename}`}
                              title="Inspect extracted chunks"
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Chunks</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onAskDocument(doc.doc_id)}
                              aria-label={`Ask questions about ${doc.filename}`}
                              title="Ask AI about this document"
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onSummarizeDocument(doc.doc_id)}
                              aria-label={`Summarize ${doc.filename}`}
                              title="Summarize document"
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocToDelete(doc)}
                              aria-label={`Delete ${doc.filename}`}
                              title="Delete document"
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-500 hover:text-rose-500 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Document Detail & Extracted Chunks Inspector Panel */}
        {inspectDoc && (
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] overflow-hidden flex flex-col max-h-[680px]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                  Document Inspector · {inspectDoc.doc_id}
                </div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
                  {inspectDoc.filename}
                </h2>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                  <span>{formatBytes(inspectDoc.file_size_bytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectDoc.page_count} pages</span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectDoc.chunk_count} chunks</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                aria-label="Close Document Inspector"
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <input
                type="text"
                aria-label="Filter extracted chunks"
                value={chunkSearch}
                onChange={(e) => setChunkSearch(e.target.value)}
                placeholder="Search inside extracted chunks..."
                className="flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                type="button"
                onClick={() => onAskDocument(inspectDoc.doc_id)}
                className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
              >
                Chat with Doc
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80">
              {isLoadingInspector ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Loading extracted vector chunks...
                </div>
              ) : filteredInspectorChunks.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No chunks match "{chunkSearch}".
                </div>
              ) : (
                filteredInspectorChunks.map((chunk) => (
                  <div key={chunk.chunk_id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          #{chunk.chunk_index + 1}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {chunk.section_title}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums">
                        Page {chunk.page_number} · {chunk.token_count} tokens
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {chunk.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-doc-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="delete-doc-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Delete Indexed Document?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to remove{' '}
                  <strong className="text-slate-900 dark:text-slate-200">
                    {docToDelete.filename}
                  </strong>
                  ? This will permanently purge all{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {docToDelete.chunk_count}
                  </span>{' '}
                  vector chunks from ChromaDB and the SQLite registry.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDocToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
