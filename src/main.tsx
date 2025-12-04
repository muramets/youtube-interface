import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryProvider } from './providers/QueryProvider'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <QueryProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryProvider>
)
