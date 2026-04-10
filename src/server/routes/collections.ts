import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  toggleCollection,
  toggleTmdbMatches,
  setCollectionImagePath,
  invalidateDiscoveryCache,
} from '../db/queries'
import {
  previewCollectionWithRules,
  previewTmdbCollection,
  previewTmdbCollectionExpanded,
  IMAGES_DIR,
} from '../sync/engine'
import { searchCompanies, searchNetworks } from '../tmdb/cache'

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const id = req.params.id
    const type = req.params.type // 'poster' or 'backdrop'
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    cb(null, `collection-${id}-${type}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are accepted'))
    }
  },
})

const router = Router()

// GET /api/collections
router.get('/', (_req, res) => {
  const collections = getCollections()
  res.json(collections)
})

// POST /api/collections
router.post('/', (req, res) => {
  const { name, rules, use_tmdb, tmdb_company_id, tmdb_network_id, tmdb_company_ids, tmdb_network_ids, remove_from_emby } = req.body as {
    name: string
    rules: { field: string; value: string }[]
    use_tmdb?: boolean
    tmdb_company_id?: number | null
    tmdb_network_id?: number | null
    tmdb_company_ids?: Array<{ id: number; name: string }>
    tmdb_network_ids?: Array<{ id: number; name: string }>
    remove_from_emby?: boolean
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Collection name is required' })
  }
  const isTmdb = use_tmdb && (tmdb_company_id != null || tmdb_network_id != null || (tmdb_company_ids?.length ?? 0) > 0 || (tmdb_network_ids?.length ?? 0) > 0)
  if (!isTmdb && (!Array.isArray(rules) || rules.length === 0)) {
    return res.status(400).json({ error: 'At least one rule is required' })
  }

  try {
    const collection = createCollection(
      name.trim(),
      rules ?? [],
      use_tmdb ? 1 : 0,
      tmdb_company_id ?? null,
      tmdb_network_id ?? null,
      tmdb_company_ids ? JSON.stringify(tmdb_company_ids) : null,
      tmdb_network_ids ? JSON.stringify(tmdb_network_ids) : null,
      remove_from_emby !== false ? 1 : 0
    )
    return res.status(201).json(collection)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A collection with that name already exists' })
    }
    return res.status(500).json({ error: msg })
  }
})

// PUT /api/collections/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { name, rules, enabled, use_tmdb, tmdb_company_id, tmdb_network_id, tmdb_company_ids, tmdb_network_ids, remove_from_emby } = req.body as {
    name: string
    rules: { field: string; value: string }[]
    enabled?: boolean
    use_tmdb?: boolean
    tmdb_company_id?: number | null
    tmdb_network_id?: number | null
    tmdb_company_ids?: Array<{ id: number; name: string }>
    tmdb_network_ids?: Array<{ id: number; name: string }>
    remove_from_emby?: boolean
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Collection name is required' })
  }

  // Invalidate discovery cache if any TMDB IDs are being updated
  if (use_tmdb || tmdb_company_id != null || tmdb_network_id != null ||
      tmdb_company_ids !== undefined || tmdb_network_ids !== undefined) {
    invalidateDiscoveryCache(id)
  }

  const enabledNum = enabled !== undefined ? (enabled ? 1 : 0) : undefined
  const useTmdbNum = use_tmdb !== undefined ? (use_tmdb ? 1 : 0) : undefined
  const removeFromEmbyNum = remove_from_emby !== undefined ? (remove_from_emby ? 1 : 0) : undefined
  const updated = updateCollection(
    id,
    name.trim(),
    rules ?? [],
    enabledNum,
    useTmdbNum,
    tmdb_company_id,
    tmdb_network_id,
    tmdb_company_ids ? JSON.stringify(tmdb_company_ids) : undefined,
    tmdb_network_ids ? JSON.stringify(tmdb_network_ids) : undefined,
    removeFromEmbyNum
  )
  if (!updated) return res.status(404).json({ error: 'Collection not found' })

  return res.json(updated)
})

// PATCH /api/collections/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { enabled } = req.body as { enabled: boolean }
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })
  toggleCollection(id, enabled)
  return res.json({ ok: true })
})

// PATCH /api/collections/:id/toggle-tmdb-matches
router.patch('/:id/toggle-tmdb-matches', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { include_tmdb_matches } = req.body as { include_tmdb_matches: boolean }
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })
  if (col.use_tmdb !== 1) {
    return res.status(400).json({ error: 'Collection is not TMDB-backed' })
  }
  toggleTmdbMatches(id, include_tmdb_matches)
  return res.json({ ok: true })
})

// DELETE /api/collections/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })
  deleteCollection(id)
  return res.json({ ok: true })
})

// GET /api/collections/:id/preview
router.get('/:id/preview', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const bypassCache = req.query.refresh === 'true'
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  try {
    if (col.use_tmdb === 1 && col.include_tmdb_matches === 1) {
      const result = await previewTmdbCollectionExpanded(col, bypassCache)
      return res.json({
        count: result.inCollection.length,
        inCollection: result.inCollection,
        notInCollection: result.notInCollection,
      })
    }

    const items = col.use_tmdb === 1
      ? await previewTmdbCollection(col, bypassCache)
      : await previewCollectionWithRules(col.rules)
    return res.json({ count: items.length, items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/collections/preview (for unsaved rules)
router.post('/preview', async (req, res) => {
  const { rules = [] } = req.body as {
    rules?: Array<{
      field: string
      value: string
      content_type?: string
      match_type?: string
      tags?: string
    }>
  }
  try {
    const items = await previewCollectionWithRules(rules)
    return res.json({ count: items.length, items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/collections/tmdb/search?q=Warner+Bros
router.get('/tmdb/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }
  try {
    const results = await searchCompanies(q)
    return res.json(results.slice(0, 10))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/collections/tmdb/networks/search?q=Netflix
router.get('/tmdb/networks/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }
  try {
    const results = await searchNetworks(q)
    return res.json(results.slice(0, 10))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/collections/:id/images/:type  (type = poster | backdrop)
router.post(
  '/:id/images/:type',
  (req, res, next) => {
    // Validate :type before multer writes anything
    if (!['poster', 'backdrop'].includes(req.params.type)) {
      return res.status(400).json({ error: 'type must be poster or backdrop' })
    }
    next()
  },
  upload.single('image'),
  (req, res) => {
    const id = parseInt(req.params.id, 10)
    const type = req.params.type as 'poster' | 'backdrop'
    const col = getCollectionById(id)
    if (!col) return res.status(404).json({ error: 'Collection not found' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    // Delete old file if a different path was stored
    const oldPath = type === 'poster' ? col.poster_path : col.backdrop_path
    if (oldPath && oldPath !== req.file.path && fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath)
    }

    setCollectionImagePath(id, type, req.file.path)
    return res.json({ ok: true, path: req.file.path })
  }
)

// DELETE /api/collections/:id/images/:type
router.delete('/:id/images/:type', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const type = req.params.type as 'poster' | 'backdrop'
  if (!['poster', 'backdrop'].includes(type)) {
    return res.status(400).json({ error: 'type must be poster or backdrop' })
  }
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  const filePath = type === 'poster' ? col.poster_path : col.backdrop_path
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  setCollectionImagePath(id, type, null)
  return res.json({ ok: true })
})

export default router
