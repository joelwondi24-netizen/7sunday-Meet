import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0"
        title="Install 7Sunday Meet"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Install App</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
        title="Install 7Sunday Meet"
      >
        {isIOS ? <Smartphone className="w-3.5 h-3.5 text-sky-500" /> : <Download className="w-3.5 h-3.5 text-sky-500" />}
        <span className="hidden md:inline">{isIOS ? 'Install on iOS' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold">Install 7Sunday Meet</h3>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {isIOS ? (
                <>
                  <p>1. Tap the <strong>Share</strong> button in Safari.</p>
                  <p>2. Scroll down and select <strong>Add to Home Screen</strong>.</p>
                  <p>3. Tap <strong>Add</strong> to launch 7Sunday Meet like a native iOS app.</p>
                </>
              ) : (
                <>
                  <p>Open your browser menu (Chrome, Edge, or Safari) and select <strong>Install 7Sunday Meet</strong> or <strong>Add to Home Screen</strong>.</p>
                </>
              )}
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
