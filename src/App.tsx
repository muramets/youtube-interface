import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { VideoProvider } from './context/VideoContext';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { VideoGrid } from './components/Video/VideoGrid';
import { WatchPage } from './components/Watch/WatchPage';
import { PlaylistsPage } from './components/Playlist/PlaylistsPage';
import { PlaylistDetailPage } from './components/Playlist/PlaylistDetailPage';
import './App.css';

import { UserProfileProvider } from './context/UserProfileContext';
import { AuthProvider } from './context/AuthContext';
import { ChannelProvider } from './context/ChannelContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';

import { CategoryBar } from './components/Video/CategoryBar';

// import { useAuth } from './context/AuthContext';
// import { useChannel } from './context/ChannelContext';

function AppContent() {
  // const { user } = useAuth();
  // const { currentChannel, loading } = useChannel();

  // Modal removed as per user request
  // const showSelector = !!user && !loading && !currentChannel;

  return (
    <div className="app-container">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <>
              <Header />
              <div className="main-content">
                <Sidebar />
                <main className="content-area">
                  <Routes>
                    <Route path="/" element={
                      <div className="animate-fade-in">
                        <CategoryBar />
                        <VideoGrid />
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
            <VideoProvider>
              <AppContent />
            </VideoProvider>
          </UserProfileProvider>
        </ThemeProvider>
      </ChannelProvider>
    </AuthProvider>
  );
}

export default App;
