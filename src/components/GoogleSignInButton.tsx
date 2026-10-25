import React from 'react';
import { FolderGit2, LogOut, CheckCircle2 } from 'lucide-react';
import { GoogleUserProfile } from '../lib/googleWorkspace';

interface GoogleSignInButtonProps {
  user: GoogleUserProfile | null;
  isSigningIn?: boolean;
  onSignIn: () => void;
  onOpenDriveModal: () => void;
  onSignOut?: () => void;
  compact?: boolean;
  label?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  user,
  isSigningIn = false,
  onSignIn,
  onOpenDriveModal,
  onSignOut,
  compact = false,
  label = 'Sign in with Google',
}) => {
  if (user) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDriveModal}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-500/10 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
          title="Browse and import files from Google Drive"
        >
          <FolderGit2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>Google Drive</span>
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        </button>

        {!compact && (
          <div className="inline-flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121624] text-xs text-slate-700 dark:text-slate-200">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Google User'}
                className="w-5 h-5 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                {(user.displayName || user.email || 'G').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-[120px] truncate font-medium hidden sm:inline">
              {user.displayName || user.email}
            </span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out of Google Workspace"
                aria-label="Sign out of Google Workspace"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSignIn}
      disabled={isSigningIn}
      className="gsi-material-button disabled:opacity-60"
    >
      <div className="gsi-material-button-state"></div>
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            style={{ display: 'block' }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            ></path>
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            ></path>
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            ></path>
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            ></path>
            <path fill="none" d="M0 0h48v48H0z"></path>
          </svg>
        </div>
        <span className="gsi-material-button-contents">
          {isSigningIn ? 'Connecting...' : label}
        </span>
        <span style={{ display: 'none' }}>{label}</span>
      </div>
    </button>
  );
};
