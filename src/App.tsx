import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { VideosProvider, useVideos } from './context/VideosContext';
import { PlaylistsProvider } from './context/PlaylistsContext';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { VideoGrid } from './components/Video/VideoGrid';
import { WatchPage } from './components/Watch/WatchPage';
import { PlaylistsPage } from './components/Playlist/PlaylistsPage';
import { PlaylistDetailPage } from './components/Playlist/PlaylistDetailPage';
import { UserProfileProvider } from './context/UserProfileContext';
import { AuthProvider } from './context/AuthContext';
import { ChannelProvider } from './context/ChannelContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { CategoryBar } from './components/Video/CategoryBar';
import { VideoFilterProvider } from './context/VideoFilterContext';
import { VideoActionsProvider } from './context/VideoActionsContext';

function AppContent() {
  const { isLoading, videos, reorderVideos } = useVideos();

  const handleVideoMove = (oldIndex: number, newIndex: number) => {
    const newVideos = [...videos];
    const [movedVideo] = newVideos.splice(oldIndex, 1);
    newVideos.splice(newIndex, 0, movedVideo);
    const newOrder = newVideos.map(v => v.id);
    reorderVideos(newOrder);
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
  return (
    <AuthProvider>
      <ChannelProvider>
        <ThemeProvider>
          <UserProfileProvider>
            <SettingsProvider>
              <VideosProvider>
                <VideoFilterProvider>
                  <VideoActionsProvider>
                    <PlaylistsProvider>
                      <AppContent />
                    </PlaylistsProvider>
                  </VideoActionsProvider>
                </VideoFilterProvider>
              </VideosProvider>
            </SettingsProvider>
          </UserProfileProvider>
        </ThemeProvider>
      </ChannelProvider>
    </AuthProvider>
  );
}

export default App;
