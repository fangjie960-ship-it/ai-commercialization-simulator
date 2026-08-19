import type { CustomerTier } from '@/types/customer'
import { TIER_RULES } from '@/config/classificationRules'

interface TierBadgeProps {
  tier: CustomerTier
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function TierBadge({ tier, showLabel = true, size = 'sm' }: TierBadgeProps) {
  const config = TIER_RULES[tier]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {showLabel && config.label}
    </span>
  )
}
