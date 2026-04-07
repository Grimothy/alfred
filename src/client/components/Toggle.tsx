import styles from './Toggle.module.css'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={[styles.toggle, checked ? styles.on : '', disabled ? styles.disabled : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.thumb} />
    </button>
  )
}
