import * as React from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  /** 最大可选日期 */
  maxDate?: Date
  /** 最小可选日期 */
  minDate?: Date
  placeholder?: string
  className?: string
}

export function DateTimePicker({
  value,
  onChange,
  maxDate,
  minDate,
  placeholder = '选择日期和时间',
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  const hours = value ? String(value.getHours()).padStart(2, '0') : '00'
  const minutes = value ? String(value.getMinutes()).padStart(2, '0') : '00'

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return
    // 保留当前时间
    const next = new Date(day)
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0)
    }
    onChange?.(next)
  }

  const handleTimeChange = (type: 'hours' | 'minutes', val: string) => {
    const num = parseInt(val, 10)
    if (isNaN(num)) return
    const base = value ? new Date(value) : new Date()
    if (type === 'hours') {
      base.setHours(Math.min(23, Math.max(0, num)), base.getMinutes(), 0, 0)
    } else {
      base.setMinutes(Math.min(59, Math.max(0, num)))
    }
    onChange?.(base)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value
            ? format(value, 'yyyy-MM-dd HH:mm', { locale: zhCN })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          disabled={(date) => {
            if (maxDate && date > maxDate) return true
            if (minDate && date < minDate) return true
            return false
          }}
        />
        {/* 时间选择 */}
        <div className="border-t px-3 py-2 flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">时间</span>
          <Input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => handleTimeChange('hours', e.target.value)}
            className="w-14 h-8 text-center text-sm tabular-nums"
          />
          <span className="text-muted-foreground">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => handleTimeChange('minutes', e.target.value)}
            className="w-14 h-8 text-center text-sm tabular-nums"
          />
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-8 text-xs"
            onClick={() => setOpen(false)}
          >
            确定
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
