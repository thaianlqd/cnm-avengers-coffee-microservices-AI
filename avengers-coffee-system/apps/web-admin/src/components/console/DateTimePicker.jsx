import { useState } from 'react'
import { format, isValid, parse } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar as CalendarIcon } from './WorkspaceIcons'
import { Calendar } from '../ui/calendar'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

/** Retains the datetime-local value/event contract used by promotion forms. */
export default function DateTimePicker({ value = '', onChange, id, disabled, required, ...props }) {
  const [open, setOpen] = useState(false)
  const parsed = value ? parse(value, "yyyy-MM-dd'T'HH:mm", new Date()) : undefined
  const date = parsed && isValid(parsed) ? parsed : undefined
  const emit = next => onChange?.({ target: { value: next, id }, currentTarget: { value: next, id } })
  const time = value?.split('T')[1]?.slice(0, 5) || '00:00'
  return <div className="workspace-datetime-picker">
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button {...props} id={id} type="button" variant="outline" disabled={disabled} aria-required={required || undefined} className="workspace-date-trigger"><CalendarIcon size={17} /><span>{date ? format(date, 'dd/MM/yyyy', { locale: vi }) : 'Chọn ngày'}</span></Button></PopoverTrigger>
      <PopoverContent align="start" className="workspace-calendar-popover"><Calendar mode="single" selected={date} defaultMonth={date} locale={vi} onSelect={day => { if (day) emit(format(day, 'yyyy-MM-dd') + 'T' + time); setOpen(false) }} /></PopoverContent>
    </Popover>
    <Input type="time" value={time} disabled={disabled || !date} aria-label="Giờ áp dụng" onChange={event => { if (date) emit(format(date, 'yyyy-MM-dd') + 'T' + event.target.value) }} />
  </div>
}
