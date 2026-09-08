import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './styles/modernist.css'
import './index.css'
import App from './App.tsx'
import SharedPlanPage from './components/SharedPlanPage.tsx'
import GroupCalendarPage from './components/GroupCalendarPage.tsx'

// Three routes, no router library: the read-only /plan/<slug> share view,
// the /group/<slug> trip calendar, and everything else = the app. Vercel
// rewrites /plan/:slug and /group/:slug -> index.html (see vercel.json) so a
// cold-loaded link lands here.
const planMatch = window.location.pathname.match(/^\/plan\/([A-Za-z0-9_-]+)\/?$/)
const groupMatch = window.location.pathname.match(/^\/group\/([a-f0-9]{32})\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {planMatch ? (
      <SharedPlanPage slug={planMatch[1]} />
    ) : groupMatch ? (
      <GroupCalendarPage slug={groupMatch[1]} />
    ) : (
      <App />
    )}
    <Analytics />
  </StrictMode>,
)
