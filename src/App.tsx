import { Routes, Route } from 'react-router-dom';
import { useEffect, Suspense, lazy } from 'react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { HomePage } from './pages/Home/HomePage';
import { useStoreInitialization } from './core/hooks/useStoreInitialization';

import { useAuth } from './core/hooks/useAuth';
import { useChannelStore } from './core/stores/channelStore';

import { useUIStore } from './core/stores/uiStore';
import { useNotificationStore } from './core/stores/notificationStore';
import { Toast } from './components/ui/molecules/Toast';

import { useCheckinScheduler } from './core/hooks/useCheckinScheduler';
import { useVideoFetchRetry } from './core/hooks/useVideoFetchRetry';
import { useAutoCleanup } from './core/hooks/useAutoCleanup';
import { useFilterChannelSync } from './core/hooks/useFilterChannelSync';
import { useTrendSubscription } from './pages/Trends/hooks/useTrendSubscription';
import { useUserPersistence } from './core/hooks/useUserPersistence';
import { VideoPlayerProvider } from './core/contexts/VideoPlayerContext';
import { GlobalMiniPlayer } from './features/Player/GlobalMiniPlayer';
import { TrendsDndProvider } from './pages/Trends/TrendsDndProvider';
import { AudioPlayer } from './pages/Music/components/AudioPlayer';
import { ChatBubble } from './features/Chat/ChatBubble';

// Route-based code splitting — each page loads as a separate chunk
const WatchPage = lazy(() => import('./features/Watch/WatchPage').then(m => ({ default: m.WatchPage })));
const PlaylistsPage = lazy(() => import('./pages/Playlists/PlaylistsPage').then(m => ({ default: m.PlaylistsPage })));
const PlaylistDetailPage = lazy(() => import('./pages/Playlists/PlaylistDetailPage').then(m => ({ default: m.PlaylistDetailPage })));
const TrendsPage = lazy(() => import('./pages/Trends/TrendsPage').then(m => ({ default: m.TrendsPage })));
const MusicPage = lazy(() => import('./pages/Music/MusicPage').then(m => ({ default: m.MusicPage })));
const DetailsPage = lazy(() => import('./pages/Details').then(m => ({ default: m.DetailsPage })));

function AppContent() {
  useCheckinScheduler();
  useVideoFetchRetry();
  useAutoCleanup();
  useUserPersistence(); // Sync user ID with stores for robust filter persistence
  useFilterChannelSync();
  useTrendSubscription();
  const { user } = useAuth();
  const { currentChannel } = useChannelStore();

  const { subscribeToNotifications } = useNotificationStore();

  useEffect(() => {
    if (user?.uid && currentChannel?.id) {
      const unsubscribe = subscribeToNotifications(user.uid, currentChannel.id);
      return () => unsubscribe();
    }
  }, [user, currentChannel, subscribeToNotifications]);

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary overflow-hidden">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-text-tertiary animate-pulse" /></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* VideoEditPage: Full-page layout without main sidebar */}
          <Route path="/video/:channelId/:videoId/details" element={
            <ProtectedRoute>
              <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--video-edit-bg)' }}>
                <Header className="bg-video-edit-bg shadow-[0_4px_12px_rgba(0,0,0,0.2)] h-16" />
                <DetailsPage />
              </div>
            </ProtectedRoute>
          } />
          <Route path="/*" element={
            <ProtectedRoute>
              <>
                <Header />
                {/* DnD Context for Trends: Video → Niche drag and drop */}
                <TrendsDndProvider>
                  <div className="flex flex-1 overflow-hidden relative">
                    <Sidebar />
                    <main className="flex-1 flex flex-col overflow-y-auto relative">
                      <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/watch/:id" element={<WatchPage />} />
                        <Route path="/playlists" element={<PlaylistsPage />} />
                        <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
                        <Route path="/trends" element={<TrendsPage />} />
                        <Route path="/music/*" element={<MusicPage />} />
                      </Routes>
                    </main>
                  </div>
                </TrendsDndProvider>
              </>
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
      <GlobalMiniPlayer />
      <AudioPlayer />
      <ChatBubble />
    </div >
  );
}

function App() {
  useStoreInitialization();

  return (
    <VideoPlayerProvider>
      <AppContent />
      <ToastWrapper />
    </VideoPlayerProvider>
  );
}

function ToastWrapper() {
  const { toast, hideToast } = useUIStore();
  return (
    <Toast
      message={toast.message}
      type={toast.type}
      isVisible={toast.isVisible}
      onClose={hideToast}
      actionLabel={toast.actionLabel}
      onAction={toast.onAction}
      position="bottom"
    />
  );
}

export default App;
