import styles from './Badge.module.css'

interface BadgeProps {
  label: string
  onRemove?: () => void
  variant?: 'default' | 'gold' | 'success' | 'error'
}

export default function Badge({ label, onRemove, variant = 'default' }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[variant]].join(' ')}>
      <span className={styles.label}>{label}</span>
      {onRemove && (
        <button className={styles.remove} onClick={onRemove} title="Remove">
          ×
        </button>
      )}
    </span>
  )
}
