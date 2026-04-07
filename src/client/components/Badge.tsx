import styles from './Badge.module.css'

interface BadgeProps {
  label: string
  onRemove?: () => void
  variant?: 'default' | 'gold' | 'success' | 'error'
}

export default function Badge({ label, onRemove, variant = 'default' }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[variant]].join(' ')}>
      {label}
      {onRemove && (
        <button className={styles.remove} onClick={onRemove} title="Remove">
          ×
        </button>
      )}
    </span>
  )
}
