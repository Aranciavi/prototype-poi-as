/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { BriLogo } from './components/BriLogo';
import { BulkSyncModal } from './components/BulkSyncModal';
import { DataQualityView } from './components/DataQualityView';
import { DirectoryWorkspace } from './components/DirectoryWorkspace';
import { GbpConnectPage } from './components/GbpConnectPage';
import { HistorySecurityView } from './components/HistorySecurityView';
import { LoginPage } from './components/LoginPage';
import { OverviewDashboard } from './components/OverviewDashboard';
import { ReviewReplyDrawer } from './components/ReviewReplyDrawer';
import { ReviewsInbox } from './components/ReviewsInbox';
import { SidebarNav } from './components/SidebarNav';
import { SyncQueueView } from './components/SyncQueueView';
import { ToastStack } from './components/ToastStack';
import { TopBar } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GbpAuthProvider } from './context/GbpAuthContext';
import { OpsProvider, useOps } from './context/OpsContext';

function WorkspaceShell() {
  const { activeView, setActiveView } = useOps();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [directoryRegionSeed, setDirectoryRegionSeed] = useState('ALL');

  const handleNavigateToRegion = (regionShort: string) => {
    setDirectoryRegionSeed(regionShort);
    setActiveView('directory');
  };

  return (
    <div className="min-h-screen flex bg-[#fbf8ff] text-[#1a1b22]">
      <SidebarNav
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="flex-1 px-4 sm:px-8 py-6">
          <div className="max-w-[1600px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeView === 'overview' && (
                  <OverviewDashboard onNavigateToRegion={handleNavigateToRegion} />
                )}
                {activeView === 'directory' && (
                  <DirectoryWorkspace initialRegionFilter={directoryRegionSeed} />
                )}
                {activeView === 'data-quality' && <DataQualityView />}
                {activeView === 'sync-queue' && <SyncQueueView />}
                {activeView === 'reviews' && <ReviewsInbox />}
                {activeView === 'history-alerts' && <HistorySecurityView />}
                {activeView === 'gbp-connect' && <GbpConnectPage />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <ReviewReplyDrawer />
      <BulkSyncModal />
      <ToastStack />
    </div>
  );
}

function AuthenticatedWorkspace({ mapsApiKey }: { mapsApiKey: string }) {
  const { user, isCheckingAuth } = useAuth();

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#fbf8ff] flex flex-col items-center justify-center p-6 gap-4">
        <BriLogo variant="full" theme="light" />
        <div className="inline-flex items-center gap-2 text-xs text-[#64748b]">
          <Loader2 className="h-4 w-4 animate-spin text-[#00529C]" />
          <span>Memeriksa sesi akun operasional BRI...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const content = (
    <GbpAuthProvider>
      <OpsProvider mapsApiKey={mapsApiKey}>
        <WorkspaceShell />
      </OpsProvider>
    </GbpAuthProvider>
  );

  if (!mapsApiKey) {
    return content;
  }

  return (
    <APIProvider
      apiKey={mapsApiKey}
      language="id"
      region="ID"
      libraries={['places', 'marker']}
    >
      {content}
    </APIProvider>
  );
}

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    let active = true;
    fetch('/api/maps/client-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { apiKey?: string } | null) => {
        if (active && data?.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {
        // Ignore config lookup error
      });
    return () => {
      active = false;
    };
  }, [mapsApiKey]);

  return (
    <AuthProvider>
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <AuthenticatedWorkspace mapsApiKey={mapsApiKey} />
    </AuthProvider>
  );
}
