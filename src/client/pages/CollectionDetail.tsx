import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCollections,
  deleteCollection,
  toggleCollection,
  toggleTmdbMatches,
  previewCollectionById,
  getCollectionItems,
  removeCollectionItem,
  requestSonarrBatch,
  requestRadarrBatch,
  getSonarrQueue,
  getRadarrQueue,
  getSonarrSeries,
  getRadarrMovies,
  Collection,
  EmbyItem,
  TmdbDiscoveryItem,
  ExpandedPreviewResponse,
} from '../api'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Toggle from '../components/Toggle'
import CollectionEditor from '../components/CollectionEditor'
import RequestModal from '../components/RequestModal'
import styles from './CollectionDetail.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────────

function toImageUrl(fsPath: string | null | undefined): string | null {
  if (!fsPath) return null
  const filename = fsPath.split('/').pop()
  if (!filename) return null
  return `/images/${filename}`
}

function itemPosterUrl(item: EmbyItem): string | null {
  const tag = item.ImageTags?.Primary
  if (!tag) return null
  return `/api/emby/image/${item.Id}?type=Primary&tag=${encodeURIComponent(tag)}&w=300`
}

function tmdbPosterUrl(posterPath: string | null): string | null {
  if (!posterPath) return null
  return `https://image.tmdb.org/t/p/w300${posterPath}`
}

// ── Item card (Emby) ───────────────────────────────────────────────────────────

function ItemCard({ item, navigate }: { item: EmbyItem; navigate: ReturnType<typeof useNavigate> }) {
  const posterUrl = itemPosterUrl(item)

  return (
    <div
      className={styles.itemCard}
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/library/item/${item.Id}`)}
    >
      {posterUrl ? (
        <img src={posterUrl} alt={item.Name} className={styles.itemPosterImg} />
      ) : (
        <div className={styles.itemMonogram}>{item.Name.charAt(0).toUpperCase()}</div>
      )}
      <div className={styles.itemScrim}>
        <span className={styles.itemName}>{item.Name}</span>
        <span className={styles.itemType}>{item.Type}</span>
        {item.ProductionYear && (
          <span className={styles.itemYear}>{item.ProductionYear}</span>
        )}
      </div>
    </div>
  )
}

// ── Removable Emby item card (for custom collections) ─────────────────────────

function RemovableEmbyCard({
  item,
  collectionId,
  navigate,
  onRemove,
  isSelected,
  onToggle,
}: {
  item: EmbyItem
  collectionId: number
  navigate: ReturnType<typeof useNavigate>
  onRemove: () => void
  isSelected?: boolean
  onToggle?: () => void
}) {
  const posterUrl = itemPosterUrl(item)

  return (
    <div className={[styles.itemCardWrapper, isSelected ? styles.itemCardSelected : ''].filter(Boolean).join(' ')}>
      {/* Selection checkbox */}
      {onToggle && (
        <div
          className={[styles.selectCheckbox, isSelected ? styles.selectCheckboxChecked : ''].filter(Boolean).join(' ')}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          {isSelected && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}
      <div
        className={styles.itemCard}
        style={{ cursor: onToggle ? 'pointer' : 'pointer' }}
        onClick={() => {
          if (onToggle) {
            onToggle()
          } else {
            navigate(`/library/item/${item.Id}`)
          }
        }}
      >
        {posterUrl ? (
          <img src={posterUrl} alt={item.Name} className={styles.itemPosterImg} />
        ) : (
          <div className={styles.itemMonogram}>{item.Name.charAt(0).toUpperCase()}</div>
        )}
        <div className={styles.itemScrim}>
          <span className={styles.itemName}>{item.Name}</span>
          <span className={styles.itemType}>{item.Type}</span>
          {item.ProductionYear && (
            <span className={styles.itemYear}>{item.ProductionYear}</span>
          )}
        </div>
      </div>
      <button
        className={styles.removeBtn}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        title="Remove from collection"
      >
        ×
      </button>
    </div>
  )
}

// ── Removable TMDB item card (for custom collections) ─────────────────────────

type ItemRequestStatus = 'requested' | 'downloading' | 'completed' | 'failed'
type RequestStatus = { status: ItemRequestStatus; progress?: number }

function RemovableTmdbCard({
  item,
  collectionId,
  navigate,
  onRemove,
  isSelected,
  onToggle,
  getItemStatus,
}: {
  item: TmdbDiscoveryItem
  collectionId: number
  navigate: ReturnType<typeof useNavigate>
  onRemove: () => void
  isSelected?: boolean
  onToggle?: () => void
  getItemStatus?: (item: TmdbDiscoveryItem) => RequestStatus | undefined
}) {
  const posterUrl = tmdbPosterUrl(item.poster_path)
  const year =
    (item.type === 'movie' ? item.release_date?.slice(0, 4) : item.first_air_date?.slice(0, 4))
    ?? (item.year ? String(item.year) : undefined)

  const status: RequestStatus | undefined = getItemStatus?.(item)

  function handleClick() {
    const params = new URLSearchParams({
      source: 'tmdb',
      tmdbId: String(item.id),
      type: item.type,
      name: item.name,
      ...(year ? { year } : {}),
      ...(item.poster_path ? { poster: item.poster_path } : {}),
    })
    navigate(`/library/item/${item.id}?${params.toString()}`)
  }

  const statusBadge = status ? (
    <div className={`${styles.statusBadge} ${styles[`statusBadge_${status.status}`]}`}>
      {status.status === 'downloading' && (
        <span className={styles.statusProgress}>{Math.round((status.progress ?? 0) * 100)}%</span>
      )}
      {status.status === 'requested' && <span>Queued</span>}
      {status.status === 'downloading' && <span>Downloading</span>}
      {status.status === 'completed' && <span>Downloaded</span>}
      {status.status === 'failed' && <span>Failed</span>}
    </div>
  ) : null

  return (
    <div className={[styles.itemCardWrapper, isSelected ? styles.itemCardSelected : ''].filter(Boolean).join(' ')}>
      {/* Selection checkbox */}
      {onToggle && (
        <div
          className={[styles.selectCheckbox, isSelected ? styles.selectCheckboxChecked : ''].filter(Boolean).join(' ')}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          {isSelected && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}
      <div
        className={`${styles.itemCard} ${styles.itemCardGlow}`}
        style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); handleClick() }}
      >
        {posterUrl ? (
          <img src={posterUrl} alt={item.name} className={styles.itemPosterImg} />
        ) : (
          <div className={styles.itemMonogram}>{item.name.charAt(0).toUpperCase()}</div>
        )}

        {/* Progress bar overlay — only render when we have a non-zero value */}
        {status?.status === 'downloading' && (status.progress ?? 0) > 0 && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }}
            />
          </div>
        )}

        <div className={styles.itemScrim}>
          <span className={styles.itemName}>{item.name}</span>
          <span className={styles.itemType}>{item.type === 'movie' ? 'Movie' : 'Series'}</span>
          {year && <span className={styles.itemYear}>{year}</span>}
        </div>

        {/* Status badge — inside card so position:absolute anchors to card */}
        {statusBadge}
      </div>

      <button
        className={`${styles.removeBtn} ${styles.removeBtnPurple}`}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        title="Remove from collection"
      >
        ×
      </button>
    </div>
  )
}

// ── Selectable card wrappers ────────────────────────────────────────────────────

interface SelectableCardProps {
  isSelected: boolean
  onToggle: () => void
  children: React.ReactNode
  className?: string
}

function SelectableCard({ isSelected, onToggle, children, className }: SelectableCardProps) {
  return (
    <div
      className={[styles.itemCardWrapper, isSelected ? styles.itemCardSelected : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ position: 'relative' }}
      onClick={onToggle}
    >
      {/* When selection is active, don't pass onClick to the child so it doesn't navigate */}
      {React.cloneElement(children as React.ReactElement<{ onClick?: unknown }>, {
        onClick: undefined,
      })}
      {/* Checkbox overlay */}
      <div className={[styles.selectCheckbox, isSelected ? styles.selectCheckboxChecked : ''].filter(Boolean).join(' ')}>
        {isSelected && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </div>
  )
}

// ── TMDB match card (purple glow) ─────────────────────────────────────────────

function TmdbMatchCard({
  item,
  navigate,
  getItemStatus,
}: {
  item: TmdbDiscoveryItem
  navigate: ReturnType<typeof useNavigate>
  getItemStatus?: (item: TmdbDiscoveryItem) => RequestStatus | undefined
}) {
  const posterUrl = tmdbPosterUrl(item.poster_path)
  const year =
    (item.type === 'movie' ? item.release_date?.slice(0, 4) : item.first_air_date?.slice(0, 4))
    ?? (item.year ? String(item.year) : undefined)

  const status: RequestStatus | undefined = getItemStatus?.(item)

  function handleClick() {
    const params = new URLSearchParams({
      source: 'tmdb',
      tmdbId: String(item.id),
      type: item.type,
      name: item.name,
      ...(year ? { year } : {}),
      ...(item.poster_path ? { poster: item.poster_path } : {}),
    })
    navigate(`/library/item/${item.id}?${params.toString()}`)
  }

  const statusBadge = status ? (
    <div className={`${styles.statusBadge} ${styles[`statusBadge_${status.status}`]}`}>
      {status.status === 'downloading' && (
        <span className={styles.statusProgress}>{Math.round((status.progress ?? 0) * 100)}%</span>
      )}
      {status.status === 'requested' && <span>Queued</span>}
      {status.status === 'downloading' && <span>Downloading</span>}
      {status.status === 'completed' && <span>Downloaded</span>}
      {status.status === 'failed' && <span>Failed</span>}
    </div>
  ) : null

  return (
    <div
      className={`${styles.itemCard} ${styles.itemCardGlow}`}
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
    >
      {posterUrl ? (
        <img src={posterUrl} alt={item.name} className={styles.itemPosterImg} />
      ) : (
        <div className={styles.itemMonogram}>{item.name.charAt(0).toUpperCase()}</div>
      )}

      {/* Progress bar overlay */}
      {status?.status === 'downloading' && (status.progress ?? 0) > 0 && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }}
          />
        </div>
      )}

      <div className={styles.itemScrim}>
        <span className={styles.itemName}>{item.name}</span>
        <span className={styles.itemType}>{item.type === 'movie' ? 'Movie' : 'Series'}</span>
        {year && <span className={styles.itemYear}>{year}</span>}
      </div>

      {statusBadge}
    </div>
  )
}

// ── Filter / sort types ───────────────────────────────────────────────────────

type SortKey = 'name-asc' | 'name-desc' | 'year-desc' | 'year-asc' | 'rating-asc' | 'rating-desc'

interface FilterState {
  search: string
  genres: string[]
  ratings: string[]
  type: 'all' | 'Movie' | 'Series'
  yearFrom: string
  yearTo: string
  sort: SortKey
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  genres: [],
  ratings: [],
  type: 'all',
  yearFrom: '',
  yearTo: '',
  sort: 'name-asc',
}

function isFiltered(f: FilterState): boolean {
  return (
    f.search !== '' ||
    f.genres.length > 0 ||
    f.ratings.length > 0 ||
    f.type !== 'all' ||
    f.yearFrom !== '' ||
    f.yearTo !== ''
  )
}

// ── Expanded or standard view ─────────────────────────────────────────────────

type StandardPreview = { count: number; items: EmbyItem[] }
type PreviewResult = StandardPreview | ExpandedPreviewResponse

function ExpandedOrStandardView({
  viewItems,
  filters,
  navigate,
  selectedEmbyIds,
  selectedTmdbIds,
  toggleEmbySelection,
  toggleTmdbSelection,
  getItemStatus,
}: {
  viewItems: PreviewResult | null
  filters: FilterState
  navigate: ReturnType<typeof useNavigate>
  selectedEmbyIds: Set<string>
  selectedTmdbIds: Set<number>
  toggleEmbySelection: (id: string) => void
  toggleTmdbSelection: (id: number) => void
  getItemStatus?: (item: TmdbDiscoveryItem) => RequestStatus | undefined
}) {
  if (!viewItems) {
    return <div className={styles.stateMsg}>No items in this collection yet.</div>
  }

  // Gather all items for filtering
  const allEmby: EmbyItem[] = 'inCollection' in viewItems
    ? viewItems.inCollection
    : viewItems.items

  const allTmdb: TmdbDiscoveryItem[] = 'notInCollection' in viewItems
    ? viewItems.notInCollection
    : []

  // Apply filters to Emby items
  const filteredEmby = allEmby.filter((item) => {
    if (filters.search && !item.Name.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.type !== 'all' && item.Type !== filters.type) return false
    if (filters.genres.length > 0 && !filters.genres.some((g) => item.Genres?.includes(g))) return false
    if (filters.ratings.length > 0) {
      const r = item.OfficialRating ?? ''
      if (!filters.ratings.includes(r)) return false
    }
    const year = item.ProductionYear
    if (filters.yearFrom && year && year < parseInt(filters.yearFrom)) return false
    if (filters.yearTo && year && year > parseInt(filters.yearTo)) return false
    return true
  })

  // Apply filters to TMDB items (search + year + type + genre)
  // Rating filter is skipped for TMDB items — OfficialRating labels (TV-MA, R, etc.)
  // don't apply to TMDB vote_average in a meaningful way; genre filtering works well
  // since we now have genre data enriched from TMDB detail API
  const filteredTmdb = allTmdb.filter((item) => {
    if (filters.search && !item.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.type !== 'all') {
      const tmdbType = item.type === 'movie' ? 'Movie' : 'Series'
      if (tmdbType !== filters.type) return false
    }
    const rawYear = item.type === 'movie' ? item.release_date : item.first_air_date
    const year = rawYear ? parseInt(rawYear.slice(0, 4)) : undefined
    if (filters.yearFrom && year && year < parseInt(filters.yearFrom)) return false
    if (filters.yearTo && year && year > parseInt(filters.yearTo)) return false
    if (filters.genres.length > 0) {
      const itemGenres = item.genres ?? []
      if (!filters.genres.some((g) => itemGenres.includes(g))) return false
    }
    return true
  })

  // Sort Emby items
  const sortedEmby = [...filteredEmby].sort((a, b) => {
    switch (filters.sort) {
      case 'name-desc': return b.Name.localeCompare(a.Name)
      case 'year-desc': return (b.ProductionYear ?? 0) - (a.ProductionYear ?? 0)
      case 'year-asc': return (a.ProductionYear ?? 0) - (b.ProductionYear ?? 0)
      case 'rating-asc': return (a.CommunityRating ?? 0) - (b.CommunityRating ?? 0)
      case 'rating-desc': return (b.CommunityRating ?? 0) - (a.CommunityRating ?? 0)
      default: return a.Name.localeCompare(b.Name)
    }
  })

  const totalEmby = allEmby.length
  const totalTmdb = allTmdb.length
  const filtered = isFiltered(filters)

  if (sortedEmby.length === 0 && filteredTmdb.length === 0) {
    return <div className={styles.stateMsg}>No items match your filters.</div>
  }

  if ('inCollection' in viewItems) {
    return (
      <>
        {sortedEmby.length > 0 && (
          <>
            <p className={styles.sectionLabel}>
              In collection ({filtered ? `${sortedEmby.length} of ${totalEmby}` : sortedEmby.length})
            </p>
            <div className={styles.itemGrid}>
              {sortedEmby.map((item: EmbyItem) => (
                <ItemCard key={item.Id} item={item} navigate={navigate} />
              ))}
            </div>
          </>
        )}

        {filteredTmdb.length > 0 && (
          <div className={styles.notInCollectionSection}>
            <p className={styles.sectionLabel}>
              Not in collection — TMDB matches ({filtered ? `${filteredTmdb.length} of ${totalTmdb}` : filteredTmdb.length})
            </p>
            <div className={styles.itemGrid}>
              {filteredTmdb.map((item) => (
                <SelectableCard
                  key={`tmdb-${item.id}`}
                  isSelected={selectedTmdbIds.has(item.id)}
                  onToggle={() => toggleTmdbSelection(item.id)}
                >
                  <TmdbMatchCard item={item} navigate={navigate} getItemStatus={getItemStatus} />
                </SelectableCard>
              ))}
            </div>
          </div>
        )}

        {sortedEmby.length === 0 && filteredTmdb.length === 0 && (
          <div className={styles.stateMsg}>No items found in this collection.</div>
        )}
      </>
    )
  }

  if (sortedEmby.length > 0) {
    return (
      <>
        {filtered && (
          <p className={styles.resultCount}>
            Showing {sortedEmby.length} of {totalEmby}
          </p>
        )}
        <div className={styles.itemGrid}>
          {sortedEmby.map((item: EmbyItem) => (
            <ItemCard key={item.Id} item={item} navigate={navigate} />
          ))}
        </div>
      </>
    )
  }

  return <div className={styles.stateMsg}>No items in this collection yet.</div>
}

// ── Custom collection view ─────────────────────────────────────────────────────

interface CustomCollectionViewProps {
  collectionId: number
  embyItems: EmbyItem[]
  tmdbItems: TmdbDiscoveryItem[]
  filters: FilterState
  navigate: ReturnType<typeof useNavigate>
  onRemoveEmby: (itemId: string) => void
  onRemoveTmdb: (itemId: number) => void
  selectedEmbyIds: Set<string>
  selectedTmdbIds: Set<number>
  toggleEmbySelection: (id: string) => void
  toggleTmdbSelection: (id: number) => void
  getItemStatus: (item: TmdbDiscoveryItem) => RequestStatus | undefined
}

function CustomCollectionView({
  collectionId,
  embyItems,
  tmdbItems,
  filters,
  navigate,
  onRemoveEmby,
  onRemoveTmdb,
  selectedEmbyIds,
  selectedTmdbIds,
  toggleEmbySelection,
  toggleTmdbSelection,
  getItemStatus,
}: CustomCollectionViewProps) {
  // Apply filters to Emby items
  const filteredEmby = embyItems.filter((item) => {
    if (filters.search && !item.Name.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.type !== 'all' && item.Type !== filters.type) return false
    if (filters.genres.length > 0 && !filters.genres.some((g) => item.Genres?.includes(g))) return false
    if (filters.ratings.length > 0) {
      const r = item.OfficialRating ?? ''
      if (!filters.ratings.includes(r)) return false
    }
    const year = item.ProductionYear
    if (filters.yearFrom && year && year < parseInt(filters.yearFrom)) return false
    if (filters.yearTo && year && year > parseInt(filters.yearTo)) return false
    return true
  })

  // Apply filters to TMDB items
  const filteredTmdb = tmdbItems.filter((item) => {
    if (filters.search && !item.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.type !== 'all') {
      const tmdbType = item.type === 'movie' ? 'Movie' : 'Series'
      if (tmdbType !== filters.type) return false
    }
    const rawYear = item.type === 'movie' ? item.release_date : item.first_air_date
    const year = rawYear ? parseInt(rawYear.slice(0, 4)) : item.year ?? undefined
    if (filters.yearFrom && year && year < parseInt(filters.yearFrom)) return false
    if (filters.yearTo && year && year > parseInt(filters.yearTo)) return false
    if (filters.genres.length > 0) {
      const itemGenres = item.genres ?? []
      if (!filters.genres.some((g) => itemGenres.includes(g))) return false
    }
    return true
  })

  // Year helper for stored TMDB items
  function storedYear(item: TmdbDiscoveryItem): number | undefined {
    if (item.year) return item.year
    if (item.type === 'movie' && item.release_date) return parseInt(item.release_date.slice(0, 4))
    if (item.first_air_date) return parseInt(item.first_air_date.slice(0, 4))
    return undefined
  }

  // Sort Emby items
  const sortedEmby = [...filteredEmby].sort((a, b) => {
    switch (filters.sort) {
      case 'name-desc': return b.Name.localeCompare(a.Name)
      case 'year-desc': return (b.ProductionYear ?? 0) - (a.ProductionYear ?? 0)
      case 'year-asc': return (a.ProductionYear ?? 0) - (b.ProductionYear ?? 0)
      case 'rating-asc': return (a.CommunityRating ?? 0) - (b.CommunityRating ?? 0)
      case 'rating-desc': return (b.CommunityRating ?? 0) - (a.CommunityRating ?? 0)
      default: return a.Name.localeCompare(b.Name)
    }
  })

  // Sort TMDB items
  const sortedTmdb = [...filteredTmdb].sort((a, b) => {
    switch (filters.sort) {
      case 'name-desc': return b.name.localeCompare(a.name)
      case 'year-desc': return (storedYear(b) ?? 0) - (storedYear(a) ?? 0)
      case 'year-asc': return (storedYear(a) ?? 0) - (storedYear(b) ?? 0)
      default: return a.name.localeCompare(b.name)
    }
  })

  const totalEmby = embyItems.length
  const totalTmdb = tmdbItems.length
  const filtered = isFiltered(filters)

  if (sortedEmby.length === 0 && sortedTmdb.length === 0) {
    return <div className={styles.stateMsg}>No items in this collection yet.</div>
  }

  return (
    <>
      {sortedEmby.length > 0 && (
        <>
          <p className={styles.sectionLabel}>
            In Emby ({filtered ? `${sortedEmby.length} of ${totalEmby}` : sortedEmby.length})
          </p>
          <div className={styles.itemGrid}>
            {sortedEmby.map((item: EmbyItem) => (
              <RemovableEmbyCard
                key={item.Id}
                item={item}
                collectionId={collectionId}
                navigate={navigate}
                onRemove={() => onRemoveEmby(item.Id)}
              />
            ))}
          </div>
        </>
      )}

      {sortedTmdb.length > 0 && (
        <div className={styles.notInCollectionSection}>
          <p className={`${styles.sectionLabel} ${styles.sectionLabelPurple}`}>
            TMDB Only ({filtered ? `${sortedTmdb.length} of ${totalTmdb}` : sortedTmdb.length})
          </p>
          <div className={styles.itemGrid}>
            {sortedTmdb.map((item) => (
              <RemovableTmdbCard
                key={`tmdb-${item.id}`}
                item={item}
                collectionId={collectionId}
                navigate={navigate}
                onRemove={() => onRemoveTmdb(item.id)}
                isSelected={selectedTmdbIds.has(item.id)}
                onToggle={() => toggleTmdbSelection(item.id)}
                getItemStatus={getItemStatus}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  viewItems,
  filters,
  onChange,
  onClear,
}: {
  viewItems: PreviewResult | null
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
  onClear: () => void
}) {
  // Derive available genres and ratings from the actual items
  const { genres, ratings } = useMemo(() => {
    const embyItems: EmbyItem[] = viewItems
      ? ('inCollection' in viewItems ? viewItems.inCollection : viewItems.items)
      : []
    const genreSet = new Set<string>()
    const ratingSet = new Set<string>()
    for (const item of embyItems) {
      item.Genres?.forEach((g) => genreSet.add(g))
      if (item.OfficialRating) ratingSet.add(item.OfficialRating)
    }
    return {
      genres: [...genreSet].sort(),
      ratings: [...ratingSet].sort(),
    }
  }, [viewItems])

  const active = isFiltered(filters)

  return (
    <div className={styles.filterPanel}>
      {/* Row 1: Search + Type + Sort */}
      <div className={styles.filterRow}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="6" cy="6" r="4.5" />
            <line x1="9.5" y1="9.5" x2="13" y2="13" />
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search items…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
          {filters.search && (
            <button className={styles.searchClear} onClick={() => onChange({ search: '' })} title="Clear">×</button>
          )}
        </div>

        {/* Type pills */}
        <div className={styles.filterGroup}>
          {(['all', 'Movie', 'Series'] as const).map((v) => (
            <button
              key={v}
              className={`${styles.filterBtn} ${filters.type === v ? styles.filterBtnActive : ''}`}
              onClick={() => onChange({ type: v })}
            >
              {v === 'all' ? 'All types' : v}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className={styles.sortWrap}>
          <select
            className={styles.sortSelect}
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortKey })}
          >
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
            <option value="year-desc">Year (newest)</option>
            <option value="year-asc">Year (oldest)</option>
            <option value="rating-desc">Rating (high)</option>
            <option value="rating-asc">Rating (low)</option>
          </select>
        </div>

        {active && (
          <button className={styles.clearAll} onClick={onClear}>Clear filters</button>
        )}
      </div>

      {/* Row 2: Year range */}
      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Year</span>
        <input
          className={styles.yearInput}
          type="number"
          placeholder="From"
          min="1900"
          max="2099"
          value={filters.yearFrom}
          onChange={(e) => onChange({ yearFrom: e.target.value })}
        />
        <span className={styles.filterSep}>–</span>
        <input
          className={styles.yearInput}
          type="number"
          placeholder="To"
          min="1900"
          max="2099"
          value={filters.yearTo}
          onChange={(e) => onChange({ yearTo: e.target.value })}
        />
      </div>

      {/* Row 3: Genres (dynamic — Emby items only) */}
      {genres.length > 0 && (
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Genre</span>
          <div className={styles.chipGroup}>
            {genres.map((g) => (
              <button
                key={g}
                className={`${styles.chip} ${filters.genres.includes(g) ? styles.chipActive : ''}`}
                onClick={() => {
                  const next = filters.genres.includes(g)
                    ? filters.genres.filter((x) => x !== g)
                    : [...filters.genres, g]
                  onChange({ genres: next })
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <span className={styles.filterHint}>Emby items only</span>
        </div>
      )}

      {/* Row 4: Ratings (dynamic — Emby items only) */}
      {ratings.length > 0 && (
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Rating</span>
          <div className={styles.chipGroup}>
            {ratings.map((r) => (
              <button
                key={r}
                className={`${styles.chip} ${filters.ratings.includes(r) ? styles.chipActive : ''}`}
                onClick={() => {
                  const next = filters.ratings.includes(r)
                    ? filters.ratings.filter((x) => x !== r)
                    : [...filters.ratings, r]
                  onChange({ ratings: next })
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <span className={styles.filterHint}>Emby items only</span>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>()
  const collectionId = parseInt(id ?? '', 10)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedEmbyIds, setSelectedEmbyIds] = useState<Set<string>>(new Set())
  const [selectedTmdbIds, setSelectedTmdbIds] = useState<Set<number>>(new Set())
  const [requestModal, setRequestModal] = useState<{ open: boolean; clientType: 'sonarr' | 'radarr' }>({
    open: false,
    clientType: 'sonarr',
  })
  const [requestResult, setRequestResult] = useState<{ open: boolean; added: number; failed: number } | null>(null)

  // Request status tracking — split by ID type so lookups are unambiguous:
  //   tmdbStatuses: keyed by TMDB id (Radarr movies)
  //   tvdbStatuses: keyed by TVDB id (Sonarr series)

  // Poll download queues for in-progress items
  const { data: sonarrQueue } = useQuery({
    queryKey: ['sonarr-queue'],
    queryFn: getSonarrQueue,
    refetchInterval: 15_000,
  })
  const { data: radarrQueue } = useQuery({
    queryKey: ['radarr-queue'],
    queryFn: getRadarrQueue,
    refetchInterval: 15_000,
  })

  // Poll Sonarr/Radarr library — gives persistent "in library" status across refreshes
  const { data: sonarrSeries } = useQuery({
    queryKey: ['sonarr-series'],
    queryFn: getSonarrSeries,
    refetchInterval: 60_000,
  })
  const { data: radarrMovies } = useQuery({
    queryKey: ['radarr-movies'],
    queryFn: getRadarrMovies,
    refetchInterval: 60_000,
  })

  // Derive status for a TMDB item from live queue + library data — no ephemeral state
  function getItemStatus(item: TmdbDiscoveryItem): RequestStatus | undefined {
    if (item.type === 'movie') {
      // Check Radarr queue first (most up-to-date progress)
      const queueRecord = radarrQueue?.records.find((r) => r.tmdbId === item.id)
      if (queueRecord) {
        const s = queueRecord.status.toLowerCase()
        if (s === 'completed' || s === 'completeddownload') return { status: 'completed' }
        if (s === 'downloading' || s === 'importpending' || s === 'imported') {
          return { status: 'downloading', progress: queueRecord.progress }
        }
        if (s === 'warning' || s === 'failed' || s === 'failedpending') return { status: 'failed' }
        // Any other queue status (delay, queued, etc.) = requested
        return { status: 'requested' }
      }
      // No queue record — check library for file or monitored state
      const movie = radarrMovies?.find((m) => m.tmdbId === item.id)
      if (movie?.hasFile) return { status: 'completed' }
      // In Radarr but no file yet = user requested it, waiting for download to start
      if (movie?.monitored) return { status: 'requested' }
      return undefined
    } else {
      // Series — match by tvdb_id
      const tvdbId = item.tvdb_id
      if (!tvdbId) return undefined
      const queueRecord = sonarrQueue?.records.find((r) => r.tvdbId === tvdbId)
      if (queueRecord) {
        const s = queueRecord.status.toLowerCase()
        if (s === 'completed' || s === 'completeddownload') return { status: 'completed' }
        if (s === 'downloading' || s === 'importpending' || s === 'imported') {
          return { status: 'downloading', progress: queueRecord.progress }
        }
        if (s === 'warning' || s === 'failed' || s === 'failedpending') return { status: 'failed' }
        return { status: 'requested' }
      }
      // No queue record — check Sonarr library
      const series = sonarrSeries?.find((s) => s.tvdbId === tvdbId)
      if (series?.monitored) return { status: 'requested' }
      return undefined
    }
  }

  function patchFilters(patch: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  function toggleEmbySelection(id: string) {
    setSelectedEmbyIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTmdbSelection(id: number) {
    setSelectedTmdbIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedEmbyIds(new Set())
    setSelectedTmdbIds(new Set())
  }

  // Derive selection type breakdown
  function getSelectionMeta(_embyItems: EmbyItem[], tmdbItems: TmdbDiscoveryItem[]) {
    const selTmdb = tmdbItems.filter((i) => selectedTmdbIds.has(i.id))
    const hasMovies = selTmdb.some((i) => i.type === 'movie')
    const hasSeries = selTmdb.some((i) => i.type === 'tv')
    return { hasMovies, hasSeries, mixed: hasMovies && hasSeries }
  }

  const totalSelected = selectedEmbyIds.size + selectedTmdbIds.size

  // Reuse the collections list query — already cached from the grid page
  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
  })

  const collection: Collection | undefined = collections.find((c) => c.id === collectionId)

  // Determine if this is a custom collection
  const isCustomCollection = collection?.type === 'custom'

  // Standard query for rule-based and TMDB collections
  const { data: viewItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['collection-view', collectionId, collection?.use_tmdb ?? 0, collection?.include_tmdb_matches ?? 0],
    queryFn: () => previewCollectionById(collectionId),
    enabled: !isNaN(collectionId) && !isCustomCollection,
  })

  // Custom collection items query
  const { data: customItems, isLoading: customItemsLoading } = useQuery({
    queryKey: ['collection-items', collectionId],
    queryFn: () => getCollectionItems(collectionId),
    enabled: !isNaN(collectionId) && isCustomCollection,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id: cid, enabled }: { id: number; enabled: boolean }) =>
      toggleCollection(cid, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })

  const toggleTmdbMutation = useMutation({
    mutationFn: ({ id: cid, include }: { id: number; include: boolean }) =>
      toggleTmdbMatches(cid, include),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      navigate('/collections')
    },
  })

  const removeEmbyMutation = useMutation({
    mutationFn: (itemId: string) => removeCollectionItem(collectionId, itemId, 'emby'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collection-items'] }),
  })

  const removeTmdbMutation = useMutation({
    mutationFn: (itemId: number) => removeCollectionItem(collectionId, String(itemId), 'tmdb'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collection-items'] }),
  })

  // Auto-promote: when radarrMovies reports hasFile for a TMDB item in this collection,
  // Auto-promote: when radarrMovies reports hasFile for a TMDB item in this collection,
  // invalidate collection-items so the server re-checks Emby and moves it to "In Emby"
  const tmdbItems = useMemo(() => {
    if (isCustomCollection) return customItems?.tmdb ?? []
    if (viewItems && 'notInCollection' in viewItems) return viewItems.notInCollection
    return []
  }, [isCustomCollection, customItems, viewItems])

  useEffect(() => {
    if (!radarrMovies || tmdbItems.length === 0) return
    const hasNewlyDownloaded = tmdbItems.some((item) => {
      if (item.type !== 'movie') return false
      const movie = radarrMovies.find((m) => m.tmdbId === item.id)
      return movie?.hasFile === true
    })
    if (hasNewlyDownloaded) {
      qc.invalidateQueries({ queryKey: ['collection-items', collectionId] })
    }
  }, [radarrMovies, tmdbItems, collectionId, qc])

  function confirmDelete() {
    if (!collection) return
    if (
      window.confirm(
        `Remove "${collection.name}" from Alfred? This will not delete the collection from Emby.`
      )
    ) {
      deleteMutation.mutate(collection.id)
    }
  }

  // ── Loading / not-found states ─────────────────────────────────────────────

  if (collectionsLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.stateMsg}>Loading…</div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className={styles.page}>
        <div className={styles.stateMsg}>Collection not found.</div>
        <div className={styles.stateMsgActions}>
          <Button variant="ghost" onClick={() => navigate('/collections')}>
            ← Back to Collections
          </Button>
        </div>
      </div>
    )
  }

  // ── Derived image URLs ─────────────────────────────────────────────────────

  const backdropUrl = toImageUrl(collection.backdrop_path)
  const posterUrl = toImageUrl(collection.poster_path)

  // ── Monogram initials (used when no poster) ────────────────────────────────

  const initials = collection.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className={styles.page}>

      {/* ── Full-bleed backdrop hero ─────────────────────────────────────── */}
      <div className={styles.hero}>
        {backdropUrl ? (
          <img src={backdropUrl} alt="" className={styles.heroBackdrop} />
        ) : (
          <div className={styles.heroFallback} />
        )}

        {/* Dark gradient scrim over backdrop */}
        <div className={styles.heroOverlay} />

        {/* Back button — top left */}
        <button className={styles.backBtn} onClick={() => navigate('/collections')}>
          ← Collections
        </button>

        {/* Hero content: poster + meta + actions */}
        <div className={styles.heroContent}>
          {/* Poster */}
          <div className={styles.heroPosterWrap}>
            {posterUrl ? (
              <img src={posterUrl} alt={collection.name} className={styles.heroPoster} />
            ) : (
              <div className={styles.heroPosterFallback}>
                <span className={styles.heroPosterInitials}>{initials}</span>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className={styles.heroMeta}>
            <h1 className={styles.heroTitle}>{collection.name}</h1>

            {/* Rule badges */}
            {collection.rules.length > 0 && (
              <div className={styles.heroBadges}>
                {collection.rules.map((r) => (
                  <Badge key={r.id} label={r.value} variant="gold" />
                ))}
              </div>
            )}

            {/* Item count */}
            {!isCustomCollection && !itemsLoading && viewItems && (
              <p className={styles.heroCount}>
                {viewItems.count} item{viewItems.count !== 1 ? 's' : ''}
              </p>
            )}
            {isCustomCollection && !customItemsLoading && customItems && (
              <p className={styles.heroCount}>
                {(customItems.tmdb?.length ?? 0) + (customItems.emby?.length ?? 0)} item{(customItems.tmdb?.length ?? 0) + (customItems.emby?.length ?? 0) !== 1 ? 's' : ''}
              </p>
            )}

            {/* Enabled toggle + action buttons */}
            <div className={styles.heroActions}>
              <div className={styles.heroToggle}>
                <Toggle
                  checked={collection.enabled === 1}
                  onChange={(enabled) =>
                    toggleMutation.mutate({ id: collection.id, enabled })
                  }
                />
                <span className={styles.heroToggleLabel}>
                  {collection.enabled === 1 ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {collection.use_tmdb === 1 && (
                <div className={styles.heroToggle}>
                  <Toggle
                    checked={collection.include_tmdb_matches === 1}
                    onChange={(include) =>
                      toggleTmdbMutation.mutate({ id: collection.id, include })
                    }
                  />
                  <span className={styles.heroToggleLabel}>
                    {collection.include_tmdb_matches === 1 ? 'TMDB matches on' : 'TMDB matches off'}
                  </span>
                </div>
              )}

              <Button variant="secondary" size="sm" onClick={() => setEditorOpen(true)}>
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={confirmDelete}
                loading={deleteMutation.isPending}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Items grid ──────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {isCustomCollection ? (
          customItemsLoading ? (
            <div className={styles.stateMsg}>Loading items…</div>
          ) : (
            <>
              <FilterPanel
                viewItems={null}
                filters={filters}
                onChange={patchFilters}
                onClear={() => setFilters(DEFAULT_FILTERS)}
              />
              <CustomCollectionView
                collectionId={collectionId}
                embyItems={customItems?.emby ?? []}
                tmdbItems={customItems?.tmdb ?? []}
                filters={filters}
                navigate={navigate}
                onRemoveEmby={(itemId) => removeEmbyMutation.mutate(itemId)}
                onRemoveTmdb={(itemId) => removeTmdbMutation.mutate(itemId)}
                selectedEmbyIds={selectedEmbyIds}
                selectedTmdbIds={selectedTmdbIds}
                toggleEmbySelection={toggleEmbySelection}
                toggleTmdbSelection={toggleTmdbSelection}
                getItemStatus={getItemStatus}
              />
            </>
          )
        ) : itemsLoading ? (
          <div className={styles.stateMsg}>Loading items…</div>
        ) : (
          <>
            <FilterPanel
              viewItems={viewItems ?? null}
              filters={filters}
              onChange={patchFilters}
              onClear={() => setFilters(DEFAULT_FILTERS)}
            />
            <ExpandedOrStandardView
              viewItems={viewItems ?? null}
              filters={filters}
              navigate={navigate}
              selectedEmbyIds={selectedEmbyIds}
              selectedTmdbIds={selectedTmdbIds}
              toggleEmbySelection={toggleEmbySelection}
              toggleTmdbSelection={toggleTmdbSelection}
              getItemStatus={getItemStatus}
            />
          </>
        )}
      </div>

      {/* Floating selection bar */}
      {totalSelected > 0 && (
        <div className={styles.floatingBar}>
          <div className={styles.floatingBarInfo}>
            <span className={styles.floatingBarCount}>{totalSelected} selected</span>
            {(() => {
              const embyItems: EmbyItem[] = viewItems
                ? ('inCollection' in viewItems ? viewItems.inCollection : viewItems.items)
                : customItems?.emby ?? []
              const tmdbItems: TmdbDiscoveryItem[] = 'notInCollection' in (viewItems ?? {})
                ? (viewItems as ExpandedPreviewResponse)?.notInCollection ?? []
                : customItems?.tmdb ?? []
              const meta = getSelectionMeta(embyItems, tmdbItems)
              if (meta.mixed) {
                return <span className={styles.floatingBarError}>Can't request mixed — select only movies or only series</span>
              }
              if (meta.hasMovies) return <span className={styles.floatingBarRadarr}>Movies → Radarr</span>
              if (meta.hasSeries) return <span className={styles.floatingBarSonarr}>Series → Sonarr</span>
              return null
            })()}
          </div>
          <div className={styles.floatingBarActions}>
            <button className={styles.cancelBtn} onClick={clearSelection}>Cancel</button>
            {(() => {
              const embyItems: EmbyItem[] = viewItems
                ? ('inCollection' in viewItems ? viewItems.inCollection : viewItems.items)
                : customItems?.emby ?? []
              const tmdbItems: TmdbDiscoveryItem[] = 'notInCollection' in (viewItems ?? {})
                ? (viewItems as ExpandedPreviewResponse)?.notInCollection ?? []
                : customItems?.tmdb ?? []
              const meta = getSelectionMeta(embyItems, tmdbItems)
              if (meta.mixed) return null
              if (meta.hasMovies) {
                return (
                  <button className={styles.requestBtn} data-client="radarr" onClick={() => setRequestModal({ open: true, clientType: 'radarr' })}>
                    Request to Radarr
                  </button>
                )
              }
              if (meta.hasSeries) {
                return (
                  <button className={styles.requestBtn} data-client="sonarr" onClick={() => setRequestModal({ open: true, clientType: 'sonarr' })}>
                    Request to Sonarr
                  </button>
                )
              }
              return null
            })()}
          </div>
        </div>
      )}

      {/* Request modal */}
      {(() => {
        const embyItems: EmbyItem[] = viewItems
          ? ('inCollection' in viewItems ? viewItems.inCollection : viewItems.items)
          : customItems?.emby ?? []
        const tmdbItems: TmdbDiscoveryItem[] = 'notInCollection' in (viewItems ?? {})
          ? (viewItems as ExpandedPreviewResponse)?.notInCollection ?? []
          : customItems?.tmdb ?? []
        const selectedEmby = embyItems.filter((i) => selectedEmbyIds.has(i.Id))
        const selectedTmdb = tmdbItems.filter((i) => selectedTmdbIds.has(i.id))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allSelected: any[] = [
          ...selectedEmby,
          ...selectedTmdb.map((t) => ({ ...t, _tmdbId: t.id })),
        ]
        return (
          <RequestModal
            open={requestModal.open}
            clientType={requestModal.clientType}
            items={allSelected}
            onClose={() => setRequestModal({ open: false, clientType: 'sonarr' })}
            onSuccess={(added, failed, _requestedIds) => {
              clearSelection()
              setRequestResult({ open: true, added, failed })
            }}
          />
        )
      })()}

      {/* Success toast */}
      {requestResult && requestResult.open && (
        <div className={styles.toast} onClick={() => setRequestResult(null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>
            {requestResult.added} added
            {requestResult.failed > 0 && `, ${requestResult.failed} failed`}
          </span>
        </div>
      )}

      <CollectionEditor
        open={editorOpen}
        collection={collection}
        onClose={() => {
          setEditorOpen(false)
          qc.invalidateQueries({ queryKey: ['collections'] })
        }}
      />
    </div>
  )
}
