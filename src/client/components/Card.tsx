import styles from './Card.module.css'

interface CardProps {
  children: React.ReactNode
  className?: string
  accent?: boolean
}

export default function Card({ children, className, accent }: CardProps) {
  return (
    <div
      className={[styles.card, accent ? styles.accent : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
