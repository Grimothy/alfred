import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCollections,
  deleteCollection,
  toggleCollection,
  toggleTmdbMatches,
  previewCollectionById,
  Collection,
  EmbyItem,
  TmdbDiscoveryItem,
  ExpandedPreviewResponse,
} from '../api'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Toggle from '../components/Toggle'
import CollectionEditor from '../components/CollectionEditor'
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

function ItemCard({ item }: { item: EmbyItem }) {
  const posterUrl = itemPosterUrl(item)

  return (
    <div className={styles.itemCard}>
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

// ── TMDB match card (purple glow) ─────────────────────────────────────────────

function TmdbMatchCard({ item }: { item: TmdbDiscoveryItem }) {
  const posterUrl = tmdbPosterUrl(item.poster_path)
  const year = item.type === 'movie' ? item.release_date?.slice(0, 4) : item.first_air_date?.slice(0, 4)

  return (
    <div className={`${styles.itemCard} ${styles.itemCardGlow}`}>
      {posterUrl ? (
        <img src={posterUrl} alt={item.name} className={styles.itemPosterImg} />
      ) : (
        <div className={styles.itemMonogram}>{item.name.charAt(0).toUpperCase()}</div>
      )}
      <div className={styles.itemScrim}>
        <span className={styles.itemName}>{item.name}</span>
        <span className={styles.itemType}>{item.type === 'movie' ? 'Movie' : 'Series'}</span>
        {year && <span className={styles.itemYear}>{year}</span>}
      </div>
    </div>
  )
}

// ── Expanded or standard view ─────────────────────────────────────────────────

type StandardPreview = { count: number; items: EmbyItem[] }
type PreviewResult = StandardPreview | ExpandedPreviewResponse

function ExpandedOrStandardView({ viewItems }: { viewItems: PreviewResult | null }) {
  if (!viewItems) {
    return <div className={styles.stateMsg}>No items in this collection yet.</div>
  }

  if ('inCollection' in viewItems) {
    const expanded = viewItems
    return (
      <>
        {expanded.inCollection.length > 0 && (
          <>
            <p className={styles.sectionLabel}>
              In collection ({expanded.inCollection.length})
            </p>
            <div className={styles.itemGrid}>
              {expanded.inCollection.map((item: EmbyItem) => (
                <ItemCard key={item.Id} item={item} />
              ))}
            </div>
          </>
        )}

        {expanded.notInCollection.length > 0 && (
          <div className={styles.notInCollectionSection}>
            <p className={styles.sectionLabel}>
              Not in collection — TMDB matches ({expanded.notInCollection.length})
            </p>
            <div className={styles.itemGrid}>
              {expanded.notInCollection.map((item) => (
                <TmdbMatchCard key={`tmdb-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {expanded.inCollection.length === 0 && expanded.notInCollection.length === 0 && (
          <div className={styles.stateMsg}>No items found in this collection.</div>
        )}
      </>
    )
  }

  if (viewItems.items.length > 0) {
    return (
      <div className={styles.itemGrid}>
        {viewItems.items.map((item: EmbyItem) => (
          <ItemCard key={item.Id} item={item} />
        ))}
      </div>
    )
  }

  return <div className={styles.stateMsg}>No items in this collection yet.</div>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>()
  const collectionId = parseInt(id ?? '', 10)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)

  // Reuse the collections list query — already cached from the grid page
  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
  })

  const collection: Collection | undefined = collections.find((c) => c.id === collectionId)

  const { data: viewItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['collection-view', collectionId, collection?.use_tmdb ?? 0, collection?.include_tmdb_matches ?? 0],
    queryFn: () => previewCollectionById(collectionId),
    enabled: !isNaN(collectionId),
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
            {!itemsLoading && viewItems && (
              <p className={styles.heroCount}>
                {viewItems.count} item{viewItems.count !== 1 ? 's' : ''}
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
        {itemsLoading ? (
          <div className={styles.stateMsg}>Loading items…</div>
        ) : (
          <ExpandedOrStandardView viewItems={viewItems ?? null} />
        )}
      </div>

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
