import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCollections,
  deleteCollection,
  toggleCollection,
  getSyncStatus,
  triggerSync,
  Collection,
} from '../api'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Toggle from '../components/Toggle'
import CollectionEditor from '../components/CollectionEditor'
import styles from './Collections.module.css'

/**
 * Convert an absolute server-side filesystem path like
 *   /app/data/images/collection-3-poster.jpg
 * to a browser-accessible URL:
 *   /images/collection-3-poster.jpg
 */
function toImageUrl(fsPath: string | null | undefined): string | null {
  if (!fsPath) return null
  const filename = fsPath.split('/').pop()
  if (!filename) return null
  return `/images/${filename}`
}

// ── Collection grid card ───────────────────────────────────────────────────────

function CollectionCard({
  c,
  onNavigate,
  onEdit,
  onDelete,
  onToggle,
  deleteLoading,
}: {
  c: Collection
  onNavigate: () => void
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  deleteLoading: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const initials = c.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const posterUrl = toImageUrl(c.poster_path)

  return (
    <div className={styles.card}>
      {/* Clicking the card image area navigates to the detail page */}
      <div className={styles.cardImage} onClick={onNavigate} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onNavigate()}>

        {posterUrl ? (
          <img src={posterUrl} alt={c.name} className={styles.posterImg} />
        ) : (
          <div className={styles.monogram} aria-hidden="true">
            <span className={styles.monogramText}>{initials}</span>
          </div>
        )}

        {/* Enabled toggle — top-right, stops propagation so click doesn't navigate */}
        <div className={styles.cardToggle} onClick={(e) => e.stopPropagation()}>
          <Toggle checked={c.enabled === 1} onChange={onToggle} />
        </div>

        {/* 3-dot action menu — bottom right */}
        <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
          <button
            className={`${styles.dotsBtn} ${menuOpen ? styles.open : ''}`}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            title="Actions"
            aria-label="Collection actions"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="2.5" r="1.2" />
              <circle cx="7" cy="7" r="1.2" />
              <circle cx="7" cy="11.5" r="1.2" />
            </svg>
          </button>
          {menuOpen && (
            <div className={styles.dotsMenu} ref={menuRef}>
              <button className={styles.actionBtn} onClick={() => { setMenuOpen(false); onEdit() }} title="Edit collection">
                Edit
              </button>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={() => { setMenuOpen(false); onDelete() }}
                disabled={deleteLoading}
                title="Remove collection"
              >
                {deleteLoading ? '…' : 'Remove'}
              </button>
            </div>
          )}
        </div>

        {/* Bottom scrim: name + badges */}
        <div className={styles.cardScrim}>
          <span className={styles.cardName}>{c.name}</span>
          {c.rules.length > 0 && (
            <div className={styles.cardBadges}>
              {c.rules.slice(0, 3).map((r) => (
                <Badge key={r.id} label={r.value} variant="gold" />
              ))}
              {c.rules.length > 3 && (
                <Badge label={`+${c.rules.length - 3}`} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Toolbar types ─────────────────────────────────────────────────────────────

type SortKey = 'name-asc' | 'name-desc' | 'newest' | 'oldest'
type StatusFilter = 'all' | 'enabled' | 'disabled'
type TypeFilter = 'all' | 'rules' | 'tmdb'

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Collections() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Collection | null>(null)

  // ── Filter / sort state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sort, setSort] = useState<SortKey>('newest')

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
  })

  const { data: syncStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: getSyncStatus,
    refetchInterval: 5000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleCollection(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-status'] })
    },
  })

  function openNew() {
    setEditTarget(null)
    setEditorOpen(true)
  }

  function openEdit(c: Collection) {
    setEditTarget(c)
    setEditorOpen(true)
  }

  function confirmDelete(c: Collection) {
    if (
      window.confirm(
        `Remove "${c.name}" from Alfred? This will not delete the collection from Emby.`
      )
    ) {
      deleteMutation.mutate(c.id)
    }
  }

  // ── Derived filtered + sorted list ──────────────────────────────────────────
  const filteredCollections = collections
    .filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter === 'enabled' && c.enabled !== 1) return false
      if (statusFilter === 'disabled' && c.enabled === 1) return false
      if (typeFilter === 'rules' && c.use_tmdb === 1) return false
      if (typeFilter === 'tmdb' && c.use_tmdb !== 1) return false
      return true
    })
    .sort((a, b) => {
      if (sort === 'name-asc') return a.name.localeCompare(b.name)
      if (sort === 'name-desc') return b.name.localeCompare(a.name)
      if (sort === 'oldest') return a.id - b.id
      return b.id - a.id // newest (default)
    })

  const isFiltered = search !== '' || statusFilter !== 'all' || typeFilter !== 'all'

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Collections</h1>
          <p className={styles.sub}>
            {collections.length} collection{collections.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            onClick={() => syncMutation.mutate()}
            loading={syncStatus?.running || syncMutation.isPending}
            disabled={syncStatus?.running}
          >
            Sync Now
          </Button>
          <Button onClick={openNew}>New Collection</Button>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      {!isLoading && collections.length > 0 && (
        <div className={styles.toolbar}>
          {/* Search */}
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="6" cy="6" r="4.5" />
              <line x1="9.5" y1="9.5" x2="13" y2="13" />
            </svg>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search collections…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch('')} title="Clear">×</button>
            )}
          </div>

          {/* Status filter */}
          <div className={styles.filterGroup}>
            {(['all', 'enabled', 'disabled'] as StatusFilter[]).map((v) => (
              <button
                key={v}
                className={`${styles.filterBtn} ${statusFilter === v ? styles.filterBtnActive : ''}`}
                onClick={() => setStatusFilter(v)}
              >
                {v === 'all' ? 'All' : v === 'enabled' ? 'Enabled' : 'Disabled'}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className={styles.filterGroup}>
            {(['all', 'rules', 'tmdb'] as TypeFilter[]).map((v) => (
              <button
                key={v}
                className={`${styles.filterBtn} ${typeFilter === v ? styles.filterBtnActive : ''}`}
                onClick={() => setTypeFilter(v)}
              >
                {v === 'all' ? 'All types' : v === 'rules' ? 'Rule-based' : 'TMDB'}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
          </select>

          {/* Clear all filters */}
          {isFiltered && (
            <button
              className={styles.clearAll}
              onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all') }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading}>Loading…</div>
      ) : collections.length === 0 ? (
        <div className={styles.empty}>
          <p>No collections yet.</p>
          <Button variant="secondary" onClick={openNew}>
            Add your first collection
          </Button>
        </div>
      ) : filteredCollections.length === 0 ? (
        <div className={styles.empty}>
          <p>No collections match your filters.</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all') }}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          {isFiltered && (
            <p className={styles.resultCount}>
              Showing {filteredCollections.length} of {collections.length}
            </p>
          )}
          <div className={styles.grid}>
            {filteredCollections.map((c) => (
              <CollectionCard
                key={c.id}
                c={c}
                onNavigate={() => navigate(`/collections/${c.id}`)}
                onEdit={() => openEdit(c)}
                onDelete={() => confirmDelete(c)}
                onToggle={(enabled) => toggleMutation.mutate({ id: c.id, enabled })}
                deleteLoading={
                  deleteMutation.isPending && deleteMutation.variables === c.id
                }
              />
            ))}
          </div>
        </>
      )}

      <CollectionEditor
        open={editorOpen}
        collection={editTarget}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
