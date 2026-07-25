import { Icon, type IconName } from '@/components/icons'

interface StatTileProps {
  icon: IconName
  label: string
  value: string | number
}

export function StatTile({ icon, label, value }: StatTileProps) {
  return (
    <div className="stat-tile">
      <Icon name={icon} size={16} className="stat-icon" />
      <span className="stat-num">{value}</span>
      <span className="stat-lbl">{label}</span>
    </div>
  )
}
