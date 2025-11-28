import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { VideosProvider } from './context/VideosContext';
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
import { ZoomControls } from './components/Video/ZoomControls';



function AppContent() {


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
                      <div className="animate-fade-in">
                        <CategoryBar />
                        <VideoGrid />
                        <ZoomControls />
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
                <PlaylistsProvider>
                  <AppContent />
                </PlaylistsProvider>
              </VideosProvider>
            </SettingsProvider>
          </UserProfileProvider>
        </ThemeProvider>
      </ChannelProvider>
    </AuthProvider>
  );
}

export default App;
