import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStudios,
  createCollection,
  updateCollection,
  previewCollectionRules,
  uploadCollectionImage,
  deleteCollectionImage,
  searchTmdbCompanies,
  searchTmdbNetworks,
  discoverTmdb,
  addCollectionItem,
  getCollectionItems,
  Collection,
  Rule,
  TmdbCompanyResult,
  TmdbNetworkResult,
  TmdbIdEntry,
  TmdbDiscoverFilters,
  TmdbDiscoverItem,
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

// TMDB Genres - hardcoded list as they rarely change
const tmdbGenres = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
  // TV-specific genres
  { id: 10759, name: 'Action & Adventure' },
  { id: 10762, name: 'Kids' },
  { id: 10763, name: 'News' },
  { id: 10764, name: 'Reality' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10766, name: 'Soap' },
  { id: 10767, name: 'Talk' },
  { id: 10768, name: 'War & Politics' },
]

export default function CollectionEditor({
  open,
  collection,
  onClose,
}: CollectionEditorProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [collectionType, setCollectionType] = useState<'emby' | 'tmdb' | 'custom'>('emby')
  // activeCollection holds the newly-created collection for custom collections
  // so the Discover Items section can be shown without re-opening the editor
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null)
  // Tracks TMDB item IDs already added to the collection (for custom collections)
  const [addedTmdbIds, setAddedTmdbIds] = useState<Set<number>>(new Set())
  const resultsRef = useRef<HTMLDivElement>(null)
  const [useTmdb, setUseTmdb] = useState(false)
  const [tmdbCompanies, setTmdbCompanies] = useState<TmdbIdEntry[]>([])
  const [tmdbSearch, setTmdbSearch] = useState('')
  const [tmdbResults, setTmdbResults] = useState<TmdbCompanyResult[]>([])
  const [tmdbSearching, setTmdbSearching] = useState(false)
  const tmdbSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tmdbNetworks, setTmdbNetworks] = useState<TmdbIdEntry[]>([])
  const [tmdbNetworkSearch, setTmdbNetworkSearch] = useState('')
  const [tmdbNetworkResults, setTmdbNetworkResults] = useState<TmdbNetworkResult[]>([])
  const [tmdbNetworkSearching, setTmdbNetworkSearching] = useState(false)
  const tmdbNetworkSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedStudios, setSelectedStudios] = useState<string[]>([])
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [studioSearch, setStudioSearch] = useState('')
  const [genreSearch, setGenreSearch] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [contentType, setContentType] = useState<'all' | 'movie' | 'series'>('all')
  const [studioMatchType, setStudioMatchType] = useState<'any' | 'primary' | 'secondary_safe'>('any')
  const [removeFromEmby, setRemoveFromEmby] = useState(true)
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

  // Custom collection TMDB discover state
  const [tmdbDiscoverType, setTmdbDiscoverType] = useState<'movie' | 'tv'>('movie')
  const [tmdbDiscoverFilters, setTmdbDiscoverFilters] = useState<Partial<TmdbDiscoverFilters>>({})
  const [tmdbDiscoverResults, setTmdbDiscoverResults] = useState<TmdbDiscoverItem[]>([])
  const [tmdbDiscoverLoading, setTmdbDiscoverLoading] = useState(false)
  const [tmdbDiscoverPage, setTmdbDiscoverPage] = useState(1)
  const [tmdbDiscoverTotalPages, setTmdbDiscoverTotalPages] = useState(1)

  // Filter state for custom collections
  const [releaseDateFrom, setReleaseDateFrom] = useState('')
  const [releaseDateTo, setReleaseDateTo] = useState('')
  const [selectedCompanies, setSelectedCompanies] = useState<TmdbIdEntry[]>([])
  const [companySearch, setCompanySearch] = useState('')
  const [companyResults, setCompanyResults] = useState<TmdbCompanyResult[]>([])
  const [companySearching, setCompanySearching] = useState(false)
  const companySearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedTmdbGenres, setSelectedTmdbGenres] = useState<number[]>([])
  const [keywords, setKeywords] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('')
  const [originalLanguage, setOriginalLanguage] = useState('')
  const [certification, setCertification] = useState('')
  const [runtimeMin, setRuntimeMin] = useState('')
  const [runtimeMax, setRuntimeMax] = useState('')
  const [voteMin, setVoteMin] = useState('')
  const [voteMax, setVoteMax] = useState('')
  const [voteCountMin, setVoteCountMin] = useState('')
  const [sortBy, setSortBy] = useState('popularity.desc')

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
      setCollectionType(collection.type || 'emby')
      setUseTmdb(collection.use_tmdb === 1)
      try {
        setTmdbCompanies(collection.tmdb_company_ids ? JSON.parse(collection.tmdb_company_ids) : [])
      } catch { setTmdbCompanies([]) }
      setTmdbSearch('')
      setTmdbResults([])
      try {
        setTmdbNetworks(collection.tmdb_network_ids ? JSON.parse(collection.tmdb_network_ids) : [])
      } catch { setTmdbNetworks([]) }
      setTmdbNetworkSearch('')
      setTmdbNetworkResults([])
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
        (firstStudioRule?.match_type as 'any' | 'primary' | 'secondary_safe') || 'any'
      )
      const tagRule = collection.rules.find((r) => r.field === 'tag')
      setTagInput(tagRule?.tags || '')
      setRemoveFromEmby(collection.remove_from_emby !== 0)
      setPoster(emptySlot(collection.poster_path))
      setBackdrop(emptySlot(collection.backdrop_path))
      // Restore TMDB discover filters for custom collections
      if (collection.type === 'custom' && collection.tmdb_discover_filters) {
        restoreFilters(collection.tmdb_discover_filters)
      }
    } else {
      setActiveCollection(null)
      setName('')
      setCollectionType('emby')
      setUseTmdb(false)
      setTmdbCompanies([])
      setTmdbSearch('')
      setTmdbResults([])
      setTmdbNetworks([])
      setTmdbNetworkSearch('')
      setTmdbNetworkResults([])
      setSelectedStudios([])
      setSelectedGenres([])
      setContentType('all')
      setStudioMatchType('any')
      setTagInput('')
      setRemoveFromEmby(true)
      setPoster(emptySlot())
      setBackdrop(emptySlot())
    }
    setPreviewResult(null)
    setError(null)
    setStudioSearch('')
    setGenreSearch('')
    // Reset TMDB discover state
    setTmdbDiscoverType('movie')
    setTmdbDiscoverFilters({})
    setTmdbDiscoverResults([])
    setTmdbDiscoverPage(1)
    setReleaseDateFrom('')
    setReleaseDateTo('')
    setSelectedCompanies([])
    setCompanySearch('')
    setCompanyResults([])
    setSelectedGenres([])
    setKeywords('')
    setExcludeKeywords('')
    setOriginalLanguage('')
    setCertification('')
    setRuntimeMin('')
    setRuntimeMax('')
    setVoteMin('')
    setVoteMax('')
    setVoteCountMin('')
    setSortBy('popularity.desc')
    setAddedTmdbIds(new Set())
  }, [collection, open])

  // Load existing TMDB items when activeCollection is set (custom collection)
  useEffect(() => {
    if (!activeCollection) return
    getCollectionItems(activeCollection.id)
      .then((data) => {
        const ids = new Set(data.tmdb.map((item) => item.id))
        setAddedTmdbIds(ids)
      })
      .catch(() => {})
  }, [activeCollection])

  useEffect(() => {
    return () => {
      if (poster.preview) URL.revokeObjectURL(poster.preview)
      if (backdrop.preview) URL.revokeObjectURL(backdrop.preview)
    }
  }, [poster.preview, backdrop.preview])

  const handleTmdbSearchChange = useCallback((q: string) => {
    setTmdbSearch(q)
    if (tmdbSearchRef.current) clearTimeout(tmdbSearchRef.current)
    if (!q.trim()) { setTmdbResults([]); return }
    tmdbSearchRef.current = setTimeout(async () => {
      setTmdbSearching(true)
      try {
        const results = await searchTmdbCompanies(q)
        setTmdbResults(results)
      } catch {
        setTmdbResults([])
      } finally {
        setTmdbSearching(false)
      }
    }, 350)
  }, [])

  const handleTmdbNetworkSearchChange = useCallback((q: string) => {
    setTmdbNetworkSearch(q)
    if (tmdbNetworkSearchRef.current) clearTimeout(tmdbNetworkSearchRef.current)
    if (!q.trim()) { setTmdbNetworkResults([]); return }
    tmdbNetworkSearchRef.current = setTimeout(async () => {
      setTmdbNetworkSearching(true)
      try {
        const results = await searchTmdbNetworks(q)
        setTmdbNetworkResults(results)
      } catch {
        setTmdbNetworkResults([])
      } finally {
        setTmdbNetworkSearching(false)
      }
    }, 350)
  }, [])

  const handleCompanySearchChange = useCallback((q: string) => {
    setCompanySearch(q)
    if (companySearchRef.current) clearTimeout(companySearchRef.current)
    if (!q.trim()) { setCompanyResults([]); return }
    companySearchRef.current = setTimeout(async () => {
      setCompanySearching(true)
      try {
        const results = await searchTmdbCompanies(q)
        setCompanyResults(results)
      } catch {
        setCompanyResults([])
      } finally {
        setCompanySearching(false)
      }
    }, 350)
  }, [])

  // Serialize current filter state for storage
  function getStoredFilters(): string | null {
    if (!hasActiveFilter) return null
    return JSON.stringify({
      type: tmdbDiscoverType,
      sort_by: sortBy,
      release_date_gte: releaseDateFrom,
      release_date_lte: releaseDateTo,
      with_companies: selectedCompanies,
      with_genres: selectedTmdbGenres,
      with_keywords: keywords,
      without_keywords: excludeKeywords,
      with_original_language: originalLanguage,
      certification,
      with_runtime_gte: runtimeMin,
      with_runtime_lte: runtimeMax,
      vote_average_gte: voteMin,
      vote_average_lte: voteMax,
      vote_count_gte: voteCountMin,
    })
  }

  // Restore filter state from stored JSON
  function restoreFilters(json: string) {
    try {
      const f = JSON.parse(json)
      if (f.type) setTmdbDiscoverType(f.type)
      if (f.sort_by) setSortBy(f.sort_by)
      if (f.release_date_gte) setReleaseDateFrom(f.release_date_gte)
      if (f.release_date_lte) setReleaseDateTo(f.release_date_lte)
      if (f.with_companies) setSelectedCompanies(f.with_companies)
      if (f.with_genres) setSelectedTmdbGenres(f.with_genres)
      if (f.with_keywords) setKeywords(f.with_keywords)
      if (f.without_keywords) setExcludeKeywords(f.without_keywords)
      if (f.with_original_language) setOriginalLanguage(f.with_original_language)
      if (f.certification) setCertification(f.certification)
      if (f.with_runtime_gte) setRuntimeMin(f.with_runtime_gte)
      if (f.with_runtime_lte) setRuntimeMax(f.with_runtime_lte)
      if (f.vote_average_gte) setVoteMin(f.vote_average_gte)
      if (f.vote_average_lte) setVoteMax(f.vote_average_lte)
      if (f.vote_count_gte) setVoteCountMin(f.vote_count_gte)
    } catch { /* ignore bad data */ }
  }

  // True if at least one discovery filter (besides name) has been set
  const hasActiveFilter =
    releaseDateFrom || releaseDateTo || selectedCompanies.length > 0
    || selectedTmdbGenres.length > 0 || keywords.trim() || excludeKeywords.trim()
    || originalLanguage || certification || runtimeMin || runtimeMax
    || voteMin || voteMax || voteCountMin

  const handleTmdbDiscover = useCallback(async (page = 1) => {
    setTmdbDiscoverLoading(true)
    try {
      const filters: TmdbDiscoverFilters = {
        type: tmdbDiscoverType,
        page,
        sort_by: sortBy,
      }

      // Date filters
      if (tmdbDiscoverType === 'movie') {
        if (releaseDateFrom) filters['release_date.gte'] = releaseDateFrom
        if (releaseDateTo) filters['release_date.lte'] = releaseDateTo
      } else {
        if (releaseDateFrom) filters['first_air_date.gte'] = releaseDateFrom
        if (releaseDateTo) filters['first_air_date.lte'] = releaseDateTo
      }

      // Other filters
      if (selectedCompanies.length > 0) {
        filters.with_companies = selectedCompanies.map(c => c.id).join('|')
      }
      if (selectedTmdbGenres.length > 0) {
        filters.with_genres = selectedTmdbGenres.join('|')
      }
      if (keywords.trim()) filters.with_keywords = keywords.trim()
      if (excludeKeywords.trim()) filters.without_keywords = excludeKeywords.trim()
      if (originalLanguage) filters.with_original_language = originalLanguage
      if (certification) {
        filters.certification_country = 'US'
        filters['certification.lte'] = certification
      }
      if (runtimeMin) filters['with_runtime.gte'] = runtimeMin
      if (runtimeMax) filters['with_runtime.lte'] = runtimeMax
      if (voteMin) filters['vote_average.gte'] = voteMin
      if (voteMax) filters['vote_average.lte'] = voteMax
      if (voteCountMin) filters['vote_count.gte'] = voteCountMin

      const response = await discoverTmdb(filters)
      const filtered = response.results.filter((r) => !addedTmdbIds.has(r.id))
      if (page === 1) {
        setTmdbDiscoverResults(filtered)
      } else {
        setTmdbDiscoverResults(prev => [...prev, ...filtered])
      }
      setTmdbDiscoverPage(response.page)
      setTmdbDiscoverTotalPages(response.total_pages)
      // Scroll to results
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err) {
      setError('Failed to discover TMDB items')
      console.error('TMDB discover error:', err)
    } finally {
      setTmdbDiscoverLoading(false)
    }
  }, [tmdbDiscoverType, sortBy, releaseDateFrom, releaseDateTo, selectedCompanies, selectedTmdbGenres, keywords, excludeKeywords, originalLanguage, certification, runtimeMin, runtimeMax, voteMin, voteMax, voteCountMin, addedTmdbIds])

  const addItemMutation = useMutation({
    mutationFn: ({ itemId, source, itemType, name, year, posterPath }: {
      itemId: string; source: 'emby' | 'tmdb'; itemType?: 'movie' | 'series'
      name?: string | null; year?: string | null; posterPath?: string | null
    }) =>
      addCollectionItem((collection ?? activeCollection)!.id, itemId, source, itemType, name, year, posterPath),
    onSuccess: (_data, { itemId }) => {
      // Track the newly added TMDB item
      const numId = parseInt(itemId, 10)
      if (!isNaN(numId)) {
        setAddedTmdbIds((prev) => new Set([...prev, numId]))
      }
      qc.invalidateQueries({ queryKey: ['collection-items', (collection ?? activeCollection)?.id] })
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to add item'
      )
    },
  })

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: async (created) => {
      await uploadPendingImages(created.id)
      qc.invalidateQueries({ queryKey: ['collections'] })
      if (collectionType === 'custom') {
        // Keep the modal open so users can discover and add items
        setActiveCollection(created)
      } else {
        onClose()
      }
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
    
    if (collectionType === 'tmdb') {
      if (tmdbCompanies.length === 0 && tmdbNetworks.length === 0) {
        setError('Select at least one TMDB production company or network')
        return
      }
    } else if (collectionType === 'emby') {
      if (selectedStudios.length === 0 && selectedGenres.length === 0 && !tagInput.trim()) {
        setError('Select at least one studio, genre, or enter tags')
        return
      }
    }
    // Custom collections don't need validation as items are added manually
    
    const rules = collectionType === 'custom' ? [] : buildRules()
    
    if (collection) {
      updateMutation.mutate({
        id: collection.id,
        data: {
          name,
          rules,
          type: collectionType,
          use_tmdb: collectionType === 'tmdb' ? 1 : 0,
          tmdb_company_ids: collectionType === 'tmdb' ? tmdbCompanies : undefined,
          tmdb_network_ids: collectionType === 'tmdb' ? tmdbNetworks : undefined,
          tmdb_discover_filters: collectionType === 'custom' ? getStoredFilters() : null,
        },
      })
    } else {
      createMutation.mutate({
        name,
        rules,
        type: collectionType,
        use_tmdb: collectionType === 'tmdb' ? 1 : 0,
        tmdb_company_ids: collectionType === 'tmdb' ? tmdbCompanies : undefined,
        tmdb_network_ids: collectionType === 'tmdb' ? tmdbNetworks : undefined,
        remove_from_emby: removeFromEmby ? 1 : 0,
        tmdb_discover_filters: collectionType === 'custom' ? getStoredFilters() : null,
      })
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
            {collection || activeCollection ? 'Edit Collection' : 'New Collection'}
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

          {/* Collection Type Tabs */}
          <div className={styles.field}>
            <label className={styles.label}>Collection Type</label>
            <div className={styles.tabs}>
              <button
                className={[styles.tab, collectionType === 'emby' ? styles.tabActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  setCollectionType('emby')
                  setUseTmdb(false)
                }}
              >
                Rule-Based
              </button>
              <button
                className={[styles.tab, collectionType === 'tmdb' ? styles.tabActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  setCollectionType('tmdb')
                  setUseTmdb(true)
                }}
              >
                TMDB
              </button>
              <button
                className={[styles.tab, collectionType === 'custom' ? styles.tabActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  setCollectionType('custom')
                  setUseTmdb(false)
                }}
              >
                Custom
              </button>
            </div>
            <div className={styles.tabDescription}>
              {collectionType === 'emby' && 'Match items automatically using Emby metadata like studios and genres.'}
              {collectionType === 'tmdb' && 'Match items based on TMDB production companies and networks.'}
              {collectionType === 'custom' && 'Manually curate items by searching and adding them individually.'}
            </div>
          </div>

          {collectionType === 'tmdb' ? (
            /* ── TMDB pickers ── */
            <>
              {/* Production Company picker */}
              <div className={styles.field}>
                <label className={styles.label}>Production Companies (Movies)</label>
                <div className={styles.fieldHint}>
                  Matches movies produced by any selected company. Leave blank to skip movie matching.
                </div>
                {tmdbCompanies.length > 0 && (
                  <div className={styles.selected}>
                    {tmdbCompanies.map((c) => (
                      <Badge
                        key={c.id}
                        label={c.name}
                        variant="gold"
                        onRemove={() => setTmdbCompanies((prev) => prev.filter((x) => x.id !== c.id))}
                      />
                    ))}
                  </div>
                )}
                <input
                  className={styles.input}
                  value={tmdbSearch}
                  onChange={(e) => handleTmdbSearchChange(e.target.value)}
                  placeholder="Search TMDB companies… (e.g. A24, Miramax)"
                />
                {tmdbSearching && (
                  <div className={styles.noResults}>Searching…</div>
                )}
                {!tmdbSearching && tmdbResults.length > 0 && (
                  <div className={styles.studioList}>
                    {tmdbResults.slice(0, 20).map((r) => {
                      const selected = tmdbCompanies.some((c) => c.id === r.id)
                      return (
                        <button
                          key={r.id}
                          className={[
                            styles.studioOption,
                            selected ? styles.studioOptionSelected : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => {
                            if (selected) {
                              setTmdbCompanies((prev) => prev.filter((x) => x.id !== r.id))
                            } else {
                              setTmdbCompanies((prev) => [...prev, { id: r.id, name: r.name }])
                            }
                          }}
                        >
                          <span className={styles.studioCheckbox}>{selected ? '✓' : ''}</span>
                          <span className={styles.studioName}>{r.name}</span>
                          <span className={styles.studioCount}>
                            {r.origin_country ? `(${r.origin_country})` : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {!tmdbSearching && tmdbSearch && tmdbResults.length === 0 && (
                  <div className={styles.noResults}>No companies match "{tmdbSearch}"</div>
                )}
                <div className={styles.fieldHint}>
                  TMDB company IDs: {tmdbCompanies.map((c) => c.id).join(', ') || '—'}
                </div>
              </div>

              {/* Network picker */}
              <div className={styles.field}>
                <label className={styles.label}>Networks (TV Shows)</label>
                <div className={styles.fieldHint}>
                  Matches TV shows from any selected network. Leave blank to skip TV matching.
                </div>
                {tmdbNetworks.length > 0 && (
                  <div className={styles.selected}>
                    {tmdbNetworks.map((n) => (
                      <Badge
                        key={n.id}
                        label={n.name}
                        variant="gold"
                        onRemove={() => setTmdbNetworks((prev) => prev.filter((x) => x.id !== n.id))}
                      />
                    ))}
                  </div>
                )}
                <input
                  className={styles.input}
                  value={tmdbNetworkSearch}
                  onChange={(e) => handleTmdbNetworkSearchChange(e.target.value)}
                  placeholder="Search TMDB networks… (e.g. Netflix, HBO)"
                />
                {tmdbNetworkSearching && (
                  <div className={styles.noResults}>Searching…</div>
                )}
                {!tmdbNetworkSearching && tmdbNetworkResults.length > 0 && (
                  <div className={styles.studioList}>
                    {tmdbNetworkResults.slice(0, 20).map((r) => {
                      const selected = tmdbNetworks.some((n) => n.id === r.id)
                      return (
                        <button
                          key={r.id}
                          className={[
                            styles.studioOption,
                            selected ? styles.studioOptionSelected : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => {
                            if (selected) {
                              setTmdbNetworks((prev) => prev.filter((x) => x.id !== r.id))
                            } else {
                              setTmdbNetworks((prev) => [...prev, { id: r.id, name: r.name }])
                            }
                          }}
                        >
                          <span className={styles.studioCheckbox}>{selected ? '✓' : ''}</span>
                          <span className={styles.studioName}>{r.name}</span>
                          <span className={styles.studioCount}>
                            {r.origin_country ? `(${r.origin_country})` : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {!tmdbNetworkSearching && tmdbNetworkSearch && tmdbNetworkResults.length === 0 && (
                  <div className={styles.noResults}>No networks match "{tmdbNetworkSearch}"</div>
                )}
                <div className={styles.fieldHint}>
                  TMDB network IDs: {tmdbNetworks.map((n) => n.id).join(', ') || '—'}
                </div>
              </div>
            </>
          ) : collectionType === 'custom' ? (
            /* ── TMDB Discover filters ── */
            <>
              {/* Content Type */}
              <div className={styles.field}>
                <label className={styles.label}>Content Type</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="tmdbDiscoverType"
                      value="movie"
                      checked={tmdbDiscoverType === 'movie'}
                      onChange={() => setTmdbDiscoverType('movie')}
                    />
                    Movies
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="tmdbDiscoverType"
                      value="tv"
                      checked={tmdbDiscoverType === 'tv'}
                      onChange={() => setTmdbDiscoverType('tv')}
                    />
                    TV Shows
                  </label>
                </div>
              </div>

              {/* Release Date Range */}
              <div className={styles.field}>
                <label className={styles.label}>
                  {tmdbDiscoverType === 'movie' ? 'Release Date Range' : 'First Air Date Range'}
                </label>
                <div className={styles.dateRange}>
                  <input
                    type="date"
                    className={styles.input}
                    value={releaseDateFrom}
                    onChange={(e) => setReleaseDateFrom(e.target.value)}
                    placeholder="From"
                  />
                  <span className={styles.dateSeparator}>to</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={releaseDateTo}
                    onChange={(e) => setReleaseDateTo(e.target.value)}
                    placeholder="To"
                  />
                </div>
              </div>

              {/* Studios / Production Companies */}
              <div className={styles.field}>
                <label className={styles.label}>Studios / Production Companies</label>
                {selectedCompanies.length > 0 && (
                  <div className={styles.selected}>
                    {selectedCompanies.map((c) => (
                      <Badge
                        key={c.id}
                        label={c.name}
                        variant="gold"
                        onRemove={() => setSelectedCompanies((prev) => prev.filter((x) => x.id !== c.id))}
                      />
                    ))}
                  </div>
                )}
                <input
                  className={styles.input}
                  value={companySearch}
                  onChange={(e) => handleCompanySearchChange(e.target.value)}
                  placeholder="Search production companies..."
                />
                {companySearching && (
                  <div className={styles.noResults}>Searching…</div>
                )}
                {!companySearching && companyResults.length > 0 && (
                  <div className={styles.studioList}>
                    {companyResults.slice(0, 20).map((r) => {
                      const selected = selectedCompanies.some((c) => c.id === r.id)
                      return (
                        <button
                          key={r.id}
                          className={[
                            styles.studioOption,
                            selected ? styles.studioOptionSelected : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => {
                            if (selected) {
                              setSelectedCompanies((prev) => prev.filter((x) => x.id !== r.id))
                            } else {
                              setSelectedCompanies((prev) => [...prev, { id: r.id, name: r.name }])
                            }
                          }}
                        >
                          <span className={styles.studioCheckbox}>{selected ? '✓' : ''}</span>
                          <span className={styles.studioName}>{r.name}</span>
                          <span className={styles.studioCount}>
                            {r.origin_country ? `(${r.origin_country})` : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Genres */}
              <div className={styles.field}>
                <label className={styles.label}>Genres</label>
                <div className={styles.genreGrid}>
                  {tmdbGenres.map((genre) => {
                    const checked = selectedTmdbGenres.includes(genre.id)
                    return (
                      <button
                        key={genre.id}
                        type="button"
                        className={[
                          styles.genreChip,
                          checked ? styles.genreChipSelected : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => {
                          setSelectedTmdbGenres((prev) =>
                            checked ? prev.filter((x) => x !== genre.id) : [...prev, genre.id]
                          )
                        }}
                      >
                        {genre.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Keywords */}
              <div className={styles.field}>
                <label className={styles.label}>Keywords (include)</label>
                <input
                  className={styles.input}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. superhero, based on novel"
                />
                <div className={styles.fieldHint}>
                  Separate multiple keywords with commas. Use keyword names, not IDs.
                </div>
              </div>

              {/* Exclude Keywords */}
              <div className={styles.field}>
                <label className={styles.label}>Exclude Keywords</label>
                <input
                  className={styles.input}
                  value={excludeKeywords}
                  onChange={(e) => setExcludeKeywords(e.target.value)}
                  placeholder="e.g. sequel, remake"
                />
              </div>

              {/* Original Language */}
              <div className={styles.field}>
                <label className={styles.label}>Original Language</label>
                <select
                  className={styles.input}
                  value={originalLanguage}
                  onChange={(e) => setOriginalLanguage(e.target.value)}
                >
                  <option value="">Any Language</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                  <option value="hi">Hindi</option>
                  <option value="ru">Russian</option>
                </select>
              </div>

              {/* Content Rating */}
              <div className={styles.field}>
                <label className={styles.label}>Max Content Rating (US)</label>
                <select
                  className={styles.input}
                  value={certification}
                  onChange={(e) => setCertification(e.target.value)}
                >
                  <option value="">Any Rating</option>
                  <option value="G">G - General Audiences</option>
                  <option value="PG">PG - Parental Guidance</option>
                  <option value="PG-13">PG-13 - Parents Strongly Cautioned</option>
                  <option value="R">R - Restricted</option>
                  <option value="NC-17">NC-17 - Adults Only</option>
                </select>
              </div>

              {/* Runtime */}
              <div className={styles.field}>
                <label className={styles.label}>Runtime (minutes)</label>
                <div className={styles.rangeInputs}>
                  <input
                    type="number"
                    className={styles.input}
                    value={runtimeMin}
                    onChange={(e) => setRuntimeMin(e.target.value)}
                    placeholder="Min"
                    min="1"
                  />
                  <span className={styles.rangeSeparator}>–</span>
                  <input
                    type="number"
                    className={styles.input}
                    value={runtimeMax}
                    onChange={(e) => setRuntimeMax(e.target.value)}
                    placeholder="Max"
                    min="1"
                  />
                </div>
              </div>

              {/* TMDB User Score */}
              <div className={styles.field}>
                <label className={styles.label}>TMDB User Score</label>
                <div className={styles.rangeInputs}>
                  <input
                    type="number"
                    className={styles.input}
                    value={voteMin}
                    onChange={(e) => setVoteMin(e.target.value)}
                    placeholder="Min"
                    min="0"
                    max="10"
                    step="0.1"
                  />
                  <span className={styles.rangeSeparator}>–</span>
                  <input
                    type="number"
                    className={styles.input}
                    value={voteMax}
                    onChange={(e) => setVoteMax(e.target.value)}
                    placeholder="Max"
                    min="0"
                    max="10"
                    step="0.1"
                  />
                </div>
              </div>

              {/* Vote Count */}
              <div className={styles.field}>
                <label className={styles.label}>Minimum Vote Count</label>
                <input
                  type="number"
                  className={styles.input}
                  value={voteCountMin}
                  onChange={(e) => setVoteCountMin(e.target.value)}
                  placeholder="e.g. 100"
                  min="0"
                />
                <div className={styles.fieldHint}>
                  Filter out items with too few user ratings
                </div>
              </div>

              {/* Sort By */}
              <div className={styles.field}>
                <label className={styles.label}>Sort By</label>
                <select
                  className={styles.input}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="popularity.desc">Popularity (High to Low)</option>
                  <option value="popularity.asc">Popularity (Low to High)</option>
                  <option value="vote_average.desc">User Score (High to Low)</option>
                  <option value="vote_average.asc">User Score (Low to High)</option>
                  <option value="release_date.desc">
                    {tmdbDiscoverType === 'movie' ? 'Release Date' : 'Air Date'} (Newest First)
                  </option>
                  <option value="release_date.asc">
                    {tmdbDiscoverType === 'movie' ? 'Release Date' : 'Air Date'} (Oldest First)
                  </option>
                  <option value="revenue.desc">Revenue (High to Low)</option>
                </select>
              </div>

              {/* Discover Results */}
              {tmdbDiscoverResults.length > 0 && (
                <div className={styles.field} ref={resultsRef}>
                  <div className={styles.discoverResults}>
                    <div className={styles.discoverHeader}>
                      <span className={styles.discoverCount}>
                        Showing {tmdbDiscoverResults.length} result{tmdbDiscoverResults.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className={styles.discoverGrid}>
                      {tmdbDiscoverResults.map((item) => (
                        <div key={`tmdb-${item.id}`} className={styles.discoverItem}>
                          <div className={styles.discoverPoster}>
                            {item.poster_path ? (
                              <img 
                                src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                                alt={item.name}
                              />
                            ) : (
                              <div className={styles.discoverPlaceholder}>
                                {item.type === 'movie' ? '🎬' : '📺'}
                              </div>
                            )}
                          </div>
                          <div className={styles.discoverInfo}>
                            <div className={styles.discoverName}>{item.name}</div>
                            <div className={styles.discoverMeta}>
                              {item.year && <span>{item.year}</span>}
                              <span className={styles.discoverRating}>⭐ {item.vote_average.toFixed(1)}</span>
                            </div>
                          </div>
                          {addedTmdbIds.has(item.id) ? (
                            <Button size="sm" variant="ghost" disabled>
                              Added ✓
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                addItemMutation.mutate({
                                  itemId: item.id.toString(),
                                  source: 'tmdb',
                                  itemType: item.type === 'tv' ? 'series' : 'movie',
                                  name: item.name,
                                  year: item.year != null ? String(item.year) : null,
                                  posterPath: item.poster_path,
                                })
                              }}
                              loading={addItemMutation.isPending}
                              disabled={!collection && !activeCollection}
                            >
                              Add
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {tmdbDiscoverPage < tmdbDiscoverTotalPages && (
                      <div className={styles.discoverLoadMore}>
                        <Button
                          variant="ghost"
                          onClick={() => handleTmdbDiscover(tmdbDiscoverPage + 1)}
                          loading={tmdbDiscoverLoading}
                        >
                          Load More
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ── Rule-based (Emby) pickers ── */
            <>
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
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="studioMatchType"
                      value="secondary_safe"
                      checked={studioMatchType === 'secondary_safe'}
                      onChange={() => setStudioMatchType('secondary_safe')}
                    />
                    Primary or Secondary (no streaming)
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
            </>
          )}

          {/* Sync behavior - only show for non-custom collections */}
          {collectionType !== 'custom' && (
            <div className={styles.field}>
              <div className={styles.toggleRow}>
                <div>
                  <div className={styles.label}>Remove items from Emby</div>
                  <div className={styles.fieldHint}>
                    When enabled, items removed from this collection during sync will also be removed from the Emby collection. When disabled, items are only ever added — never removed.
                  </div>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={removeFromEmby}
                    onChange={(e) => setRemoveFromEmby(e.target.checked)}
                  />
                  <span className={styles.switchTrack}>
                    <span className={styles.switchThumb} />
                  </span>
                </label>
              </div>
            </div>
          )}

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

          {/* Preview results - only for rule-based collections */}
          {collectionType === 'emby' && previewResult && (
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
          {collectionType === 'emby' && (
            <Button
              variant="ghost"
              onClick={handlePreview}
              loading={previewLoading}
              disabled={selectedStudios.length === 0 && selectedGenres.length === 0 && !tagInput.trim()}
            >
              Preview
            </Button>
          )}
          {collectionType === 'custom' && (collection || activeCollection) && (
            <Button
              variant="secondary"
              onClick={() => handleTmdbDiscover(1)}
              loading={tmdbDiscoverLoading}
              disabled={!hasActiveFilter}
            >
              Discover Items
            </Button>
          )}
          <div className={styles.footerActions}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={isLoading}>
              {collection || activeCollection ? 'Save Changes' : 'Create'}
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