import type { Industry } from '@/types/customer'
import { INDUSTRY_CONFIG } from '@/config/industryCoefficients'

interface IndustryBadgeProps {
  industry: Industry
  size?: 'sm' | 'md'
}

const industryColors: Record<Industry, string> = {
  drama: '#8b5cf6', // purple
  game: '#06b6d4',  // cyan
  ecommerce: '#f97316', // orange
  education: '#10b981', // emerald
  other: '#6b7280'  // gray
}

export function IndustryBadge({ industry, size = 'sm' }: IndustryBadgeProps) {
  const name = INDUSTRY_CONFIG[industry].name
  const color = industryColors[industry]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: `${color}20`,
        color
      }}
    >
      {name}
    </span>
  )
}
