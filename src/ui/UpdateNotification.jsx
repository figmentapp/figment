import React, { useEffect, useState } from 'react';

export default function UpdateNotification() {
  const [status, setStatus] = useState('idle'); // idle, available, downloading, downloaded, error
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!window.desktop) return;

    const onUpdateAvailable = (info) => {
      setStatus('available');
      setVersion(info.version);
    };

    const onUpdateDownloaded = (info) => {
      setStatus('downloaded');
      setVersion(info.version);
    };

    const onUpdateError = (err) => {
      console.error('Update error:', err);
      setStatus('error');
    };

    window.desktop.registerListener('update-available', onUpdateAvailable);
    window.desktop.registerListener('update-downloaded', onUpdateDownloaded);
    window.desktop.registerListener('update-error', onUpdateError);

    // Check for updates on mount (optional, main process handles it too)
    // window.desktop.invoke('checkForUpdates');

    return () => {
      // Cleanup if needed, though registerListener might not have unregister
    };
  }, []);

  const handleUpdate = () => {
    setStatus('downloading');
    window.desktop.invoke('startDownload');
  };

  const handleRestart = () => {
    window.desktop.invoke('quitAndInstall');
  };

  const handleDismiss = () => {
    setStatus('idle');
  };

  if (status === 'idle' || status === 'error') return null;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded shadow-lg z-50 max-w-sm border border-gray-700">
      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-lg">Update Available</h3>
        {status === 'available' && (
          <>
            <p className="text-sm text-gray-300">A new version ({version}) is available. Would you like to update?</p>
            <div className="flex gap-2 mt-2 justify-end">
              <button onClick={handleDismiss} className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors">
                Later
              </button>
              <button onClick={handleUpdate} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors">
                Update
              </button>
            </div>
          </>
        )}
        {status === 'downloading' && <p className="text-sm text-gray-300">Downloading update...</p>}
        {status === 'downloaded' && (
          <>
            <p className="text-sm text-gray-300">Update downloaded. Restart now to install?</p>
            <div className="flex gap-2 mt-2 justify-end">
              <button onClick={handleDismiss} className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors">
                Later
              </button>
              <button onClick={handleRestart} className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 rounded transition-colors">
                Restart
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
