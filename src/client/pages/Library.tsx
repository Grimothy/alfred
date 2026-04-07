import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getStudios, getStudioItems, EmbyItem } from '../api'
import Card from '../components/Card'
import styles from './Library.module.css'

export default function Library() {
  const [selectedStudio, setSelectedStudio] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: studios = [], isLoading } = useQuery({
    queryKey: ['studios'],
    queryFn: getStudios,
  })

  const { data: studioItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['studio-items', selectedStudio],
    queryFn: () => getStudioItems(selectedStudio!),
    enabled: !!selectedStudio,
  })

  const filtered = studios.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Library</h1>
          <p className={styles.sub}>
            {studios.length} studios & networks in your Emby library
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.studioPanel}>
          <div className={styles.searchWrap}>
            <input
              className={styles.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter studios…"
            />
          </div>

          {isLoading ? (
            <div className={styles.loading}>Loading studios…</div>
          ) : (
            <div className={styles.studioList}>
              {filtered.map((s) => (
                <button
                  key={s.name}
                  className={[
                    styles.studioRow,
                    selectedStudio === s.name ? styles.selected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() =>
                    setSelectedStudio(
                      selectedStudio === s.name ? null : s.name
                    )
                  }
                >
                  <span className={styles.studioName}>{s.name}</span>
                  <span className={styles.studioMeta}>
                    {s.movies > 0 && (
                      <span className={styles.studioCount}>
                        {s.movies}m
                      </span>
                    )}
                    {s.series > 0 && (
                      <span className={styles.studioCount}>
                        {s.series}s
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className={styles.loading}>No results</div>
              )}
            </div>
          )}
        </div>

        <div className={styles.itemPanel}>
          {!selectedStudio ? (
            <div className={styles.emptyItems}>
              <p>Select a studio to browse its content.</p>
            </div>
          ) : itemsLoading ? (
            <div className={styles.loadingItems}>Loading items…</div>
          ) : (
            <>
              <div className={styles.itemsHeader}>
                <span className={styles.itemsTitle}>{selectedStudio}</span>
                <span className={styles.itemsCount}>
                  {studioItems.length} items
                </span>
              </div>
              <div className={styles.itemsList}>
                {studioItems.map((item: EmbyItem) => (
                  <div key={item.Id} className={styles.itemRow}>
                    <span className={styles.itemName}>{item.Name}</span>
                    <span className={styles.itemType}>{item.Type}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
