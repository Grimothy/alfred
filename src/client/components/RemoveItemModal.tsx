import { useEffect, useState } from 'react'
import { EmbyItem, TmdbDiscoveryItem, checkRadarrMovieExists, checkSonarrSeriesExists } from '../api'
import Button from './Button'
import styles from './RemoveItemModal.module.css'

type RemoveItem = EmbyItem | TmdbDiscoveryItem

interface Props {
  open: boolean
  item: RemoveItem
  onClose: () => void
  onRemoveFromCollection: () => void
  onRemoveFromArrAndCollection: () => void
  loading: boolean
  error: string | null
}

function getItemName(item: RemoveItem): string {
  return 'Name' in item ? item.Name : item.name
}

function getItemYear(item: RemoveItem): number | undefined {
  if (isEmbyItem(item)) return item.ProductionYear
  return item.year ?? undefined
}

function getItemType(item: RemoveItem): 'Movie' | 'Series' {
  if ('Type' in item) return item.Type === 'Movie' ? 'Movie' : 'Series'
  return item.type === 'movie' ? 'Movie' : 'Series'
}

function isEmbyItem(item: RemoveItem): item is EmbyItem {
  return 'Id' in item
}

function tmdbPosterUrl(path: string | null): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/w300${path}`
}

export default function RemoveItemModal({
  open,
  item,
  onClose,
  onRemoveFromCollection,
  onRemoveFromArrAndCollection,
  loading,
  error,
}: Props) {
  const [existsInArr, setExistsInArr] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  const isMovie = getItemType(item) === 'Movie'
  const arrLabel = isMovie ? 'Radarr' : 'Sonarr'

  useEffect(() => {
    if (!open) {
      setExistsInArr(null)
      setChecking(false)
      return
    }

    if (isEmbyItem(item)) {
      setExistsInArr(null)
      setChecking(false)
      return
    }

    const tmdbId = item.id
    const tvdbId = item.tvdb_id

    if (isMovie) {
      setChecking(true)
      checkRadarrMovieExists(tmdbId)
        .then((r) => setExistsInArr(r.exists))
        .catch(() => setExistsInArr(false))
        .finally(() => setChecking(false))
    } else if (tvdbId) {
      setChecking(true)
      checkSonarrSeriesExists(tvdbId)
        .then((r) => setExistsInArr(r.exists))
        .catch(() => setExistsInArr(false))
        .finally(() => setChecking(false))
    } else {
      setExistsInArr(false)
    }
  }, [open, item])

  if (!open) return null

  const posterUrl = isEmbyItem(item)
    ? (item.ImageTags?.Primary ? `/api/emby/image/${item.Id}?type=Primary&tag=${encodeURIComponent(item.ImageTags.Primary)}&w=300` : null)
    : tmdbPosterUrl(item.poster_path)

  const hasArrId = isEmbyItem(item)
    ? isMovie
      ? !!(item.ProviderIds?.Tmdb || item.ProviderIds?.TMDB)
      : !!(item.ProviderIds?.Tvdb || item.ProviderIds?.TVDB)
    : isMovie ? true : item.tvdb_id !== null

  const showArrButton = !isEmbyItem(item)
  const arrButtonEnabled = !loading && !checking && hasArrId && (existsInArr === true)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.posterThumb}>
            {posterUrl ? (
              <img src={posterUrl} alt={getItemName(item)} />
            ) : (
              <div className={styles.monogram}>{getItemName(item).charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div className={styles.headerText}>
            <div className={styles.itemName}>{getItemName(item)}</div>
            <div className={styles.itemMeta}>
              <span className={styles.typeBadge}>{getItemType(item)}</span>
              {getItemYear(item) && (
                <span className={styles.year}>{getItemYear(item)}</span>
              )}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Cancel">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}

          {checking && (
            <div className={styles.checkingBanner}>
              Checking {arrLabel}…
            </div>
          )}

          {!showArrButton && existsInArr === false && !checking && (
            <div className={styles.notInArrBanner}>
              Not found in {arrLabel} — item will only be removed from collection
            </div>
          )}

          <p className={styles.prompt}>How would you like to remove this item?</p>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={onRemoveFromCollection}
              disabled={loading}
            >
              Remove from Collection
            </Button>

            {showArrButton ? (
              <div className={styles.arrAction}>
                <Button
                  variant="danger"
                  onClick={onRemoveFromArrAndCollection}
                  disabled={!arrButtonEnabled}
                  title={
                    checking
                      ? `Checking ${arrLabel}…`
                      : !hasArrId
                        ? `No ${arrLabel} ID found — cannot delete from ${arrLabel}`
                        : existsInArr === false
                          ? `Not in ${arrLabel} — cannot delete from ${arrLabel}`
                          : `Delete from ${arrLabel} (includes files) and remove from collection`
                  }
                >
                  {loading ? 'Deleting…' : `Remove from ${arrLabel}`}
                </Button>
                {checking && (
                  <span className={styles.arrHint}>Checking {arrLabel}…</span>
                )}
                {!checking && !hasArrId && (
                  <span className={styles.arrHint}>No {arrLabel} ID found</span>
                )}
                {!checking && hasArrId && existsInArr === false && (
                  <span className={styles.arrHint}>Not found in {arrLabel}</span>
                )}
              </div>
            ) : (
              <div className={styles.arrAction}>
                <Button
                  variant="danger"
                  onClick={onRemoveFromArrAndCollection}
                  disabled={loading || !hasArrId}
                  title={
                    !hasArrId
                      ? `No ${arrLabel} ID found — cannot delete from ${arrLabel}`
                      : `Delete from ${arrLabel} (includes files) and remove from collection`
                  }
                >
                  {loading ? 'Deleting…' : `Remove from ${arrLabel}`}
                </Button>
                {!hasArrId && (
                  <span className={styles.arrHint}>
                    No {arrLabel} ID found — cannot delete from {arrLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          <button className={styles.cancelLink} onClick={onClose} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
