import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { VideoGrid } from './features/Video/VideoGrid';
import { WatchPage } from './features/Watch/WatchPage';
import { PlaylistsPage } from './features/Playlist/PlaylistsPage';
import { PlaylistDetailPage } from './features/Playlist/PlaylistDetailPage';
import { CategoryBar } from './features/Video/CategoryBar';
import { TrendsPage } from './pages/Trends/TrendsPage';
import { DetailsPage } from './pages/DetailsPage';
import { useStoreInitialization } from './core/hooks/useStoreInitialization';
import { useVideos } from './core/hooks/useVideos';

import { useSettings } from './core/hooks/useSettings';
import { useAuth } from './core/hooks/useAuth';
import { useChannelStore } from './core/stores/channelStore';

import { useUIStore } from './core/stores/uiStore';
import { useNotificationStore } from './core/stores/notificationStore';
import { Toast } from './components/Shared/Toast';

import { useCheckinScheduler } from './core/hooks/useCheckinScheduler';
import { useVideoFetchRetry } from './core/hooks/useVideoFetchRetry';
import { useAutoCleanup } from './core/hooks/useAutoCleanup';
import { useFilterChannelSync } from './core/hooks/useFilterChannelSync';
import { useTrendSubscription } from './pages/Trends/hooks/useTrendSubscription';
import { useUserPersistence } from './core/hooks/useUserPersistence';
import { TrendsDndProvider } from './pages/Trends/TrendsDndProvider';

function AppContent() {
  useCheckinScheduler();
  useVideoFetchRetry();
  useAutoCleanup();
  useUserPersistence(); // Sync user ID with stores for robust filter persistence
  useFilterChannelSync();
  useTrendSubscription();
  const { user } = useAuth();
  const { currentChannel } = useChannelStore();
  const { isLoading, videos } = useVideos(user?.uid || '', currentChannel?.id || '');

  const { updateVideoOrder, videoOrder } = useSettings();
  const { subscribeToNotifications } = useNotificationStore();

  useEffect(() => {
    if (user?.uid && currentChannel?.id) {
      const unsubscribe = subscribeToNotifications(user.uid, currentChannel.id);
      return () => unsubscribe();
    }
  }, [user, currentChannel, subscribeToNotifications]);

  const handleVideoMove = (movedVideoId: string, targetVideoId: string) => {
    if (!user || !currentChannel) return;

    // If we have a saved order, use it. Otherwise, initialize it from current videos.
    let currentOrder = [...(videoOrder || [])];
    if (currentOrder.length === 0 && videos.length > 0) {
      currentOrder = videos.map(v => v.id);
    }

    // Ensure all current videos are in the order list
    const orderSet = new Set(currentOrder);
    videos.forEach(v => {
      if (!orderSet.has(v.id)) {
        currentOrder.push(v.id);
      }
    });

    const oldIndex = currentOrder.indexOf(movedVideoId);
    const newIndex = currentOrder.indexOf(targetVideoId);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...currentOrder];
      const [movedId] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, movedId);

      updateVideoOrder(user.uid, currentChannel.id, newOrder);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary overflow-hidden">
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
                      <Route path="/" element={
                        <div className="h-full flex flex-col">
                          <CategoryBar />
                          <div className="flex-1 min-h-0 relative">
                            <VideoGrid isLoading={isLoading} onVideoMove={handleVideoMove} />
                          </div>
                        </div>
                      } />
                      <Route path="/watch/:id" element={<WatchPage />} />
                      <Route path="/playlists" element={<PlaylistsPage />} />
                      <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
                      <Route path="/trends" element={<TrendsPage />} />
                    </Routes>
                  </main>
                </div>
              </TrendsDndProvider>
            </>
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}

function App() {
  useStoreInitialization();

  return (
    <>
      <AppContent />
      <ToastWrapper />
    </>
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
    />
  );
}

export default App;
