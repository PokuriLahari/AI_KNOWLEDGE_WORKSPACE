import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  RefreshCw,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  FolderGit2,
  DownloadCloud,
  ShieldCheck,
} from 'lucide-react';
import {
  DriveFileItem,
  GoogleUserProfile,
  listGoogleDriveFiles,
  fetchDriveFileForIndexing,
  getDriveMimeBadge,
} from '../lib/googleWorkspace';
import { workspaceApi, formatBytes } from '../lib/apiClient';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: GoogleUserProfile | null;
  needsAuth: boolean;
  isSigningIn: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onRequireReauth: () => void;
  indexedFilenames: string[];
  onDocumentImported: () => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  user,
  needsAuth,
  isSigningIn,
  onSignIn,
  onSignOut,
  onRequireReauth,
  indexedFilenames,
  onDocumentImported,
  onNotify,
}) => {
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [importingIds, setImportingIds] = useState<Record<string, boolean>>({});
  const [importedIds, setImportedIds] = useState<Record<string, boolean>>({});

  const fetchFiles = useCallback(
    async (query = '') => {
      if (!user || needsAuth) return;
      setIsLoadingFiles(true);
      setDriveError(null);
      try {
        const files = await listGoogleDriveFiles(query);
        setDriveFiles(files);
      } catch (err: any) {
        if (err?.message === 'AUTH_REQUIRED') {
          onRequireReauth();
        } else {
          setDriveError(
            err?.message || 'Unable to list files from Google Drive.'
          );
        }
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [user, needsAuth, onRequireReauth]
  );

  useEffect(() => {
    if (isOpen && user && !needsAuth) {
      fetchFiles('');
    }
  }, [isOpen, user, needsAuth, fetchFiles]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles(searchQuery);
  };

  const handleImportFile = async (file: DriveFileItem) => {
    setImportingIds((prev) => ({ ...prev, [file.id]: true }));
    setDriveError(null);
    try {
      const payload = await fetchDriveFileForIndexing(file);
      const fileObj = new File([payload.content], payload.filename, {
        type: 'text/plain',
      });
      const res = await workspaceApi.uploadDocument(fileObj);

      setImportedIds((prev) => ({ ...prev, [file.id]: true }));
      await onDocumentImported();
      onNotify(
        'success',
        `Imported "${res.document.filename}" from Google Drive (${res.document.chunk_count} chunks indexed).`
      );
    } catch (err: any) {
      if (err?.message === 'AUTH_REQUIRED') {
        onRequireReauth();
        onNotify('error', 'Google Drive session expired. Please sign in again.');
      } else {
        setDriveError(
          err?.message || `Failed to import "${file.name}" from Google Drive.`
        );
        onNotify(
          'error',
          err?.message || `Failed to import "${file.name}" from Google Drive.`
        );
      }
    } finally {
      setImportingIds((prev) => ({ ...prev, [file.id]: false }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Google Drive Document Connector"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-black/70 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111420] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-[#0D101A]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200/70 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <FolderGit2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Connect Google Drive & Import Documents
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Browse your Google Docs, Sheets, Slides, PDFs, and text files to index directly into Knowledge Workspace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Google Drive connector"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Unauthenticated State */}
              {!user || needsAuth ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B0D14] p-8 text-center space-y-5">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-center mx-auto">
                    <FolderGit2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Sign in with Google to Connect Your Drive
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Authenticate with your Google account using read-only permission (
                      <code className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                        drive.readonly
                      </code>
                      ) to search, preview, and index your Google Drive files into the RAG vector store.
                    </p>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-3 pt-1">
                    <GoogleSignInButton
                      user={ null }
                      isSigningIn={isSigningIn}
                      onSignIn={onSignIn}
                      onOpenDriveModal={() => {}}
                      label="Sign in with Google"
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Read-only access · In-memory session token · Never modifies your Drive files
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Connected Account Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10">
                    <div className="flex items-center gap-3 min-w-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'Google User'}
                          className="w-8 h-8 rounded-full object-cover border border-emerald-300 dark:border-emerald-500/40"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                          {(user.displayName || user.email || 'G')
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                          <span className="truncate">
                            {user.displayName || 'Connected Google Account'}
                          </span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                          {user.email} · Google Drive Read-Only Connected
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchFiles(searchQuery)}
                        disabled={isLoadingFiles}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#141824] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            isLoadingFiles ? 'animate-spin' : ''
                          }`}
                        />
                        <span>Sync</span>
                      </button>
                      <button
                        type="button"
                        onClick={onSignOut}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#141824] hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>

                  {/* Drive Search Bar */}
                  <form onSubmit={handleSearchSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search your Google Drive files by filename..."
                        className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D14] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoadingFiles}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Search Drive
                    </button>
                  </form>

                  {/* Error Banner */}
                  {driveError && (
                    <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{driveError}</span>
                    </div>
                  )}

                  {/* File List */}
                  {isLoadingFiles ? (
                    <div className="py-12 text-center space-y-2">
                      <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin mx-auto" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Fetching files from your Google Drive...
                      </p>
                    </div>
                  ) : driveFiles.length === 0 ? (
                    <div className="py-10 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-1.5">
                      <FileText className="w-6 h-6 text-slate-400 mx-auto" />
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        No matching files found in your Google Drive
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Try clearing the search filter or uploading a document to your Drive.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800/80 overflow-hidden bg-white dark:bg-[#0D101A]">
                      {driveFiles.map((file) => {
                        const badge = getDriveMimeBadge(file.mimeType);
                        const isImporting = Boolean(importingIds[file.id]);
                        const isAlreadyIndexed =
                          Boolean(importedIds[file.id]) ||
                          indexedFilenames.some((name) =>
                            name
                              .toLowerCase()
                              .startsWith(
                                file.name.replace(/\.[^/.]+$/, '').toLowerCase()
                              )
                          );

                        return (
                          <div
                            key={file.id}
                            className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {file.name}
                                  </span>
                                  {file.webViewLink && (
                                    <a
                                      href={file.webViewLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Open in Google Drive"
                                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                    {badge.label}
                                  </span>
                                  {file.size && (
                                    <>
                                      <span>·</span>
                                      <span>{formatBytes(Number(file.size))}</span>
                                    </>
                                  )}
                                  {file.modifiedTime && (
                                    <>
                                      <span>·</span>
                                      <span>
                                        {new Date(
                                          file.modifiedTime
                                        ).toLocaleDateString()}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isImporting}
                              onClick={() => handleImportFile(file)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                                isAlreadyIndexed
                                  ? 'border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs'
                              }`}
                            >
                              {isImporting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Indexing...</span>
                                </>
                              ) : isAlreadyIndexed ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Re-sync</span>
                                </>
                              ) : (
                                <>
                                  <DownloadCloud className="w-3.5 h-3.5" />
                                  <span>Import & Index</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D14] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                Imported Drive files are automatically chunked and indexed for RAG Q&A, Summaries, and Compare.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
