import { Icon, type IconName } from '@/components/icons'

interface EmptyStateProps {
  icon: IconName
  title: string
  description?: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden>
        <Icon name={icon} size={26} />
      </span>
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
    </div>
  )
}
