import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSyncStatus, getVersion } from './api'
import Dashboard from './pages/Dashboard'
import Collections from './pages/Collections'
import Library from './pages/Library'
import History from './pages/History'
import Settings from './pages/Settings'
import Setup from './pages/Setup'
import styles from './App.module.css'

export default function App() {
  const { data: syncStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: getSyncStatus,
    refetchInterval: 5000,
  })

  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    staleTime: Infinity,
  })

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandName}>Alfred</span>
          <span className={styles.brandTag}>at your service.</span>
        </div>

        <ul className={styles.navList}>
          <li>
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/collections" className={navClass}>
              Collections
            </NavLink>
          </li>
          <li>
            <NavLink to="/library" className={navClass}>
              Library
            </NavLink>
          </li>
          <li>
            <NavLink to="/history" className={navClass}>
              History
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </li>
        </ul>

        {syncStatus?.running && (
          <div className={styles.syncIndicator}>
            <span className={styles.syncDot} />
            Syncing…
          </div>
        )}

        <div className={styles.sidebarFooter}>
          <span className={styles.version}>{version ? `v${version}` : '…'}</span>
        </div>
      </nav>

      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/library" element={<Library />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/setup" element={<Setup />} />
        </Routes>
      </main>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? [styles.navLink, styles.navLinkActive].join(' ')
    : styles.navLink
}
