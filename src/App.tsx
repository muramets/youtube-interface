import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { VideoGrid } from './components/Video/VideoGrid';
import { WatchPage } from './components/Watch/WatchPage';
import { PlaylistsPage } from './components/Playlist/PlaylistsPage';
import { PlaylistDetailPage } from './components/Playlist/PlaylistDetailPage';
import { CategoryBar } from './components/Video/CategoryBar';
import { useStoreInitialization } from './hooks/useStoreInitialization';
import { useVideosStore } from './stores/videosStore';
import { useSettingsStore } from './stores/settingsStore';
import { useAuthStore } from './stores/authStore';
import { useChannelStore } from './stores/channelStore';
import { useUIStore } from './stores/uiStore';
import { Toast } from './components/Shared/Toast';

function AppContent() {
  const { isLoading, videos } = useVideosStore();
  const { updateVideoOrder, videoOrder } = useSettingsStore();
  const { user } = useAuthStore();
  const { currentChannel } = useChannelStore();

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
        <Route path="/*" element={
          <ProtectedRoute>
            <>
              <Header />
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
                  </Routes>
                </main>
              </div>
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
