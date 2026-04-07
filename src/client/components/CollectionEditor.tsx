import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStudios,
  createCollection,
  updateCollection,
  previewCollectionRules,
  uploadCollectionImage,
  deleteCollectionImage,
  Collection,
  Rule,
} from '../api'
import Button from './Button'
import Badge from './Badge'
import styles from './CollectionEditor.module.css'

interface CollectionEditorProps {
  open: boolean
  collection?: Collection | null
  onClose: () => void
}

interface ImageSlot {
  file: File | null
  preview: string | null
  existing: string | null
  remove: boolean
}

function emptySlot(existing: string | null = null): ImageSlot {
  return { file: null, preview: null, existing, remove: false }
}

export default function CollectionEditor({
  open,
  collection,
  onClose,
}: CollectionEditorProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [selectedStudios, setSelectedStudios] = useState<string[]>([])
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [studioSearch, setStudioSearch] = useState('')
  const [genreSearch, setGenreSearch] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [contentType, setContentType] = useState<'all' | 'movie' | 'series'>('all')
  const [studioMatchType, setStudioMatchType] = useState<'any' | 'primary'>('any')
  const [poster, setPoster] = useState<ImageSlot>(emptySlot())
  const [backdrop, setBackdrop] = useState<ImageSlot>(emptySlot())
  const [previewResult, setPreviewResult] = useState<{
    count: number
    items: { Id: string; Name: string; Type: string }[]
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const posterInputRef = useRef<HTMLInputElement>(null)
  const backdropInputRef = useRef<HTMLInputElement>(null)

  const { data: studios = [] } = useQuery({
    queryKey: ['studios'],
    queryFn: getStudios,
    enabled: open,
  })

  const allGenres = Array.from(
    new Set(
      studios.flatMap((s) => {
        return []
      })
    )
  ).sort()

  useEffect(() => {
    if (collection) {
      setName(collection.name)
      setSelectedStudios(
        collection.rules.filter((r) => r.field === 'studio').map((r) => r.value)
      )
      setSelectedGenres(
        collection.rules.filter((r) => r.field === 'genre').map((r) => r.value)
      )
      const firstStudioRule = collection.rules.find((r) => r.field === 'studio')
      setContentType(
        (firstStudioRule?.content_type as 'all' | 'movie' | 'series') || 'all'
      )
      setStudioMatchType(
        (firstStudioRule?.match_type as 'any' | 'primary') || 'any'
      )
      const tagRule = collection.rules.find((r) => r.field === 'tag')
      setTagInput(tagRule?.tags || '')
      setPoster(emptySlot(collection.poster_path))
      setBackdrop(emptySlot(collection.backdrop_path))
    } else {
      setName('')
      setSelectedStudios([])
      setSelectedGenres([])
      setContentType('all')
      setStudioMatchType('any')
      setTagInput('')
      setPoster(emptySlot())
      setBackdrop(emptySlot())
    }
    setPreviewResult(null)
    setError(null)
    setStudioSearch('')
    setGenreSearch('')
  }, [collection, open])

  useEffect(() => {
    return () => {
      if (poster.preview) URL.revokeObjectURL(poster.preview)
      if (backdrop.preview) URL.revokeObjectURL(backdrop.preview)
    }
  }, [poster.preview, backdrop.preview])

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: async (created) => {
      await uploadPendingImages(created.id)
      qc.invalidateQueries({ queryKey: ['collections'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Unknown error'
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateCollection>[1] }) =>
      updateCollection(id, data),
    onSuccess: async (updated) => {
      if (updated) await uploadPendingImages(updated.id)
      qc.invalidateQueries({ queryKey: ['collections'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Unknown error'
      )
    },
  })

  async function uploadPendingImages(id: number) {
    const slots: { slot: ImageSlot; type: 'poster' | 'backdrop' }[] = [
      { slot: poster, type: 'poster' },
      { slot: backdrop, type: 'backdrop' },
    ]
    for (const { slot, type } of slots) {
      if (slot.remove && slot.existing) {
        await deleteCollectionImage(id, type).catch(() => {})
      } else if (slot.file) {
        await uploadCollectionImage(id, type, slot.file).catch(() => {})
      }
    }
  }

  function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<ImageSlot>>
  ) {
    const file = e.target.files?.[0]
    if (!file) return
    setter((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview)
      return { file, preview: URL.createObjectURL(file), existing: prev.existing, remove: false }
    })
    e.target.value = ''
  }

  function handleRemoveImage(
    setter: React.Dispatch<React.SetStateAction<ImageSlot>>,
    slot: ImageSlot
  ) {
    if (slot.preview) URL.revokeObjectURL(slot.preview)
    setter({ file: null, preview: null, existing: slot.existing, remove: true })
  }

  function buildRules(): Rule[] {
    const rules: Rule[] = []

    if (selectedStudios.length > 0) {
      for (const s of selectedStudios) {
        rules.push({
          field: 'studio',
          value: s,
          content_type: contentType,
          match_type: studioMatchType,
          tags: '',
        })
      }
    }

    if (selectedGenres.length > 0) {
      for (const g of selectedGenres) {
        rules.push({
          field: 'genre',
          value: g,
          content_type: contentType,
          match_type: 'any',
          tags: '',
        })
      }
    }

    if (tagInput.trim()) {
      rules.push({
        field: 'tag',
        value: tagInput.trim(),
        content_type: contentType,
        match_type: 'any',
        tags: tagInput.trim(),
      })
    }

    return rules
  }

  function handleSave() {
    setError(null)
    if (!name.trim()) { setError('Collection name is required'); return }
    if (selectedStudios.length === 0 && selectedGenres.length === 0 && !tagInput.trim()) {
      setError('Select at least one studio, genre, or enter tags')
      return
    }
    const rules = buildRules()
    if (collection) {
      updateMutation.mutate({ id: collection.id, data: { name, rules } })
    } else {
      createMutation.mutate({ name, rules })
    }
  }

  async function handlePreview() {
    setPreviewLoading(true)
    try {
      const rules = buildRules()
      const result = await previewCollectionRules(rules)
      setPreviewResult(result)
    } catch {
      setPreviewResult(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const filteredStudios = studios.filter((s) =>
    s.name.toLowerCase().includes(studioSearch.toLowerCase())
  )

  const isLoading = createMutation.isPending || updateMutation.isPending

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {collection ? 'Edit Collection' : 'New Collection'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.body}>
          {/* Name */}
          <div className={styles.field}>
            <label className={styles.label}>Collection Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Netflix Originals"
              autoFocus
            />
          </div>

          {/* Content Type */}
          <div className={styles.field}>
            <label className={styles.label}>Content Type</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="contentType"
                  value="all"
                  checked={contentType === 'all'}
                  onChange={() => setContentType('all')}
                />
                All
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="contentType"
                  value="movie"
                  checked={contentType === 'movie'}
                  onChange={() => setContentType('movie')}
                />
                Movies Only
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="contentType"
                  value="series"
                  checked={contentType === 'series'}
                  onChange={() => setContentType('series')}
                />
                TV Only
              </label>
            </div>
          </div>

          {/* Studios */}
          <div className={styles.field}>
            <label className={styles.label}>Studios / Networks</label>
            {selectedStudios.length > 0 && (
              <div className={styles.selected}>
                {selectedStudios.map((s) => (
                  <Badge
                    key={s}
                    label={s}
                    variant="gold"
                    onRemove={() =>
                      setSelectedStudios((prev) => prev.filter((x) => x !== s))
                    }
                  />
                ))}
              </div>
            )}
            <div className={styles.matchTypeRow}>
              <span className={styles.matchTypeLabel}>Matching:</span>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="studioMatchType"
                  value="any"
                  checked={studioMatchType === 'any'}
                  onChange={() => setStudioMatchType('any')}
                />
                Any Studio
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="studioMatchType"
                  value="primary"
                  checked={studioMatchType === 'primary'}
                  onChange={() => setStudioMatchType('primary')}
                />
                Primary Only
              </label>
            </div>
            <input
              className={styles.input}
              value={studioSearch}
              onChange={(e) => setStudioSearch(e.target.value)}
              placeholder="Search studios..."
            />
            <div className={styles.studioList}>
              {filteredStudios.slice(0, 50).map((s) => {
                const checked = selectedStudios.includes(s.name)
                return (
                  <button
                    key={s.name}
                    className={[
                      styles.studioOption,
                      checked ? styles.studioOptionSelected : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      setSelectedStudios((prev) =>
                        checked ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                      )
                    }}
                  >
                    <span className={styles.studioCheckbox}>{checked ? '✓' : ''}</span>
                    <span className={styles.studioName}>{s.name}</span>
                    <span className={styles.studioCount}>{s.movies + s.series} items</span>
                  </button>
                )
              })}
              {filteredStudios.length === 0 && studioSearch && (
                <div className={styles.noResults}>No studios match "{studioSearch}"</div>
              )}
            </div>
          </div>

          {/* Genres */}
          <div className={styles.field}>
            <label className={styles.label}>Genres (optional)</label>
            {selectedGenres.length > 0 && (
              <div className={styles.selected}>
                {selectedGenres.map((g) => (
                  <Badge
                    key={g}
                    label={g}
                    variant="gold"
                    onRemove={() =>
                      setSelectedGenres((prev) => prev.filter((x) => x !== g))
                    }
                  />
                ))}
              </div>
            )}
            <input
              className={styles.input}
              value={genreSearch}
              onChange={(e) => setGenreSearch(e.target.value)}
              placeholder="Search genres..."
            />
            <div className={styles.studioList}>
              {['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western']
                .filter((g) => g.toLowerCase().includes(genreSearch.toLowerCase()))
                .map((g) => {
                  const checked = selectedGenres.includes(g)
                  return (
                    <button
                      key={g}
                      className={[
                        styles.studioOption,
                        checked ? styles.studioOptionSelected : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        setSelectedGenres((prev) =>
                          checked ? prev.filter((x) => x !== g) : [...prev, g]
                        )
                      }}
                    >
                      <span className={styles.studioCheckbox}>{checked ? '✓' : ''}</span>
                      <span className={styles.studioName}>{g}</span>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Tags */}
          <div className={styles.field}>
            <label className={styles.label}>Tags (for original content detection)</label>
            <input
              className={styles.input}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. Netflix Original, Hulu Original, Original"
            />
            <div className={styles.fieldHint}>
              Separate multiple tags with commas. Items must have ALL listed tags to match.
            </div>
          </div>

          {/* Images */}
          <div className={styles.imagesRow}>
            <ImageUploadSlot
              label="Poster"
              hint="Portrait · JPG/PNG"
              slot={poster}
              inputRef={posterInputRef}
              onChange={(e) => handleFileChange(e, setPoster)}
              onRemove={() => handleRemoveImage(setPoster, poster)}
              aspect="portrait"
            />
            <ImageUploadSlot
              label="Backdrop"
              hint="Landscape · JPG/PNG"
              slot={backdrop}
              inputRef={backdropInputRef}
              onChange={(e) => handleFileChange(e, setBackdrop)}
              onRemove={() => handleRemoveImage(setBackdrop, backdrop)}
              aspect="landscape"
            />
          </div>

          {/* Preview results */}
          {previewResult && (
            <div className={styles.preview}>
              <div className={styles.previewHeader}>
                <span className={styles.previewCount}>
                  {previewResult.count} items would be in this collection
                </span>
              </div>
              <div className={styles.previewList}>
                {previewResult.items.slice(0, 20).map((item) => (
                  <div key={item.Id} className={styles.previewItem}>
                    <span>{item.Name}</span>
                    <span className={styles.previewType}>{item.Type}</span>
                  </div>
                ))}
                {previewResult.count > 20 && (
                  <div className={styles.previewMore}>+{previewResult.count - 20} more…</div>
                )}
              </div>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <Button
            variant="ghost"
            onClick={handlePreview}
            loading={previewLoading}
            disabled={selectedStudios.length === 0 && selectedGenres.length === 0 && !tagInput.trim()}
          >
            Preview
          </Button>
          <div className={styles.footerActions}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={isLoading}>
              {collection ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ImageUploadSlotProps {
  label: string
  hint: string
  slot: ImageSlot
  inputRef: React.RefObject<HTMLInputElement>
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
  aspect: 'portrait' | 'landscape'
}

function ImageUploadSlot({
  label,
  hint,
  slot,
  inputRef,
  onChange,
  onRemove,
  aspect,
}: ImageUploadSlotProps) {
  const hasImage = (slot.preview || (slot.existing && !slot.remove))
  const displaySrc = slot.preview ?? null

  return (
    <div className={styles.imageSlot}>
      <div className={styles.imageSlotLabel}>
        <span className={styles.label}>{label}</span>
        <span className={styles.imageHint}>{hint}</span>
      </div>
      <div
        className={[
          styles.imageDropzone,
          aspect === 'portrait' ? styles.portrait : styles.landscape,
          hasImage ? styles.hasImage : '',
        ].filter(Boolean).join(' ')}
        onClick={() => inputRef.current?.click()}
      >
        {displaySrc ? (
          <img src={displaySrc} className={styles.imagePreview} alt={label} />
        ) : hasImage ? (
          <div className={styles.imageStored}>
            <span className={styles.imageStoredIcon}>✓</span>
            <span className={styles.imageStoredText}>Image saved</span>
          </div>
        ) : (
          <div className={styles.imagePlaceholder}>
            <span className={styles.imagePlusIcon}>+</span>
            <span className={styles.imageUploadText}>Upload {label}</span>
          </div>
        )}
      </div>
      {hasImage && (
        <button
          className={styles.imageRemoveBtn}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.fileInput}
        onChange={onChange}
      />
    </div>
  )
}