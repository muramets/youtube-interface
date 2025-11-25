import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { VideoProvider, useVideo } from './context/VideoContext';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { VideoGrid } from './components/Video/VideoGrid';
import { WatchPage } from './components/Watch/WatchPage';
import './App.css';

import { UserProfileProvider } from './context/UserProfileContext';

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
                    <>
                      <CategoryBar />
                      <VideoGrid />
                    </>
                  } />
                  <Route path="/watch/:id" element={<WatchPage />} />
                </Routes>
              </main>
            </div>
          </div>
        </VideoProvider>
      </UserProfileProvider>
    </ThemeProvider>
  );
}

const CategoryBar = () => {
  const { uniqueChannels, selectedChannel, setSelectedChannel } = useVideo();
  const categories = ['All', ...uniqueChannels];

  return (
    <div className="categories">
      {categories.map((category, index) => (
        <button
          key={index}
          className={`category-pill ${selectedChannel === category ? 'active' : ''}`}
          onClick={() => setSelectedChannel(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
};

export default App;
