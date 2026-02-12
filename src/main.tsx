import { Buffer } from 'buffer';
(globalThis as Record<string, unknown>).Buffer = Buffer;

import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryProvider } from './components/providers/QueryProvider'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <QueryProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryProvider>
)
