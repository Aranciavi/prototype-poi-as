/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
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

function AuthenticatedWorkspace() {
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

  return (
    <GbpAuthProvider>
      <OpsProvider mapsApiKey="">
        <WorkspaceShell />
      </OpsProvider>
    </GbpAuthProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedWorkspace />
    </AuthProvider>
  );
}
