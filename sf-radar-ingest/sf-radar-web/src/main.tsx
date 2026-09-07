import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './styles/modernist.css'
import './index.css'
import App from './App.tsx'
import SharedPlanPage from './components/SharedPlanPage.tsx'

// Two routes, no router library: the read-only /plan/<slug> share view, and
// everything else = the app. Vercel rewrites /plan/:slug -> index.html
// (see vercel.json) so a cold-loaded share link lands here.
const planMatch = window.location.pathname.match(/^\/plan\/([A-Za-z0-9_-]+)\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {planMatch ? <SharedPlanPage slug={planMatch[1]} /> : <App />}
    <Analytics />
  </StrictMode>,
)
