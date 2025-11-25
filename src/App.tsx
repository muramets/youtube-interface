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

import { CategoryBar } from './components/Video/CategoryBar';

function App() {
  return (
    <ThemeProvider>
      <UserProfileProvider>
        <VideoProvider>
          <div className="app-container">
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
          </div>
        </VideoProvider>
      </UserProfileProvider>
    </ThemeProvider>
  );
}

export default App;
