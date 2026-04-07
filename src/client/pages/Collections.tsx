import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCollections,
  deleteCollection,
  toggleCollection,
  Collection,
} from '../api'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Toggle from '../components/Toggle'
import CollectionEditor from '../components/CollectionEditor'
import styles from './Collections.module.css'

export default function Collections() {
  const qc = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Collection | null>(null)

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
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

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Collections</h1>
          <p className={styles.sub}>
            {collections.length} collection{collections.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Button onClick={openNew}>New Collection</Button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading…</div>
      ) : collections.length === 0 ? (
        <div className={styles.empty}>
          <p>No collections yet.</p>
          <Button variant="secondary" onClick={openNew}>
            Add your first collection
          </Button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Studios / Networks</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.id}>
                  <td className={styles.nameCell}>
                    <span className={styles.collName}>{c.name}</span>
                  </td>
                  <td>
                    <div className={styles.badges}>
                      {c.rules.slice(0, 5).map((r) => (
                        <Badge key={r.id} label={r.value} variant="gold" />
                      ))}
                      {c.rules.length > 5 && (
                        <Badge label={`+${c.rules.length - 5} more`} />
                      )}
                    </div>
                  </td>
                  <td>
                    <Toggle
                      checked={c.enabled === 1}
                      onChange={(enabled) =>
                        toggleMutation.mutate({ id: c.id, enabled })
                      }
                    />
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => confirmDelete(c)}
                        loading={
                          deleteMutation.isPending &&
                          deleteMutation.variables === c.id
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CollectionEditor
        open={editorOpen}
        collection={editTarget}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
