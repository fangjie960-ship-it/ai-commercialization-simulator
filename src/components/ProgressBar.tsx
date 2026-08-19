interface ProgressBarProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  color?: string
}

export function ProgressBar({ 
  value, 
  max = 100, 
  size = 'md', 
  showLabel = true,
  color
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  
  // 自动颜色：根据完成率
  const autoColor = percentage >= 80 ? '#22c55e' : 
                    percentage >= 60 ? '#3b82f6' : 
                    percentage >= 40 ? '#f59e0b' : '#ef4444'
  
  const barColor = color || autoColor
  
  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  }

  return (
    <div className="flex items-center gap-3">
      <div className={`flex-1 bg-white rounded-full ${heightClasses[size]} overflow-hidden`}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, backgroundColor: barColor }}
        />
      </div>
      {showLabel && (
        <span className="text-sm text-gray-500 w-12 text-right">
          {percentage.toFixed(1)}%
        </span>
      )}
    </div>
  )
}
