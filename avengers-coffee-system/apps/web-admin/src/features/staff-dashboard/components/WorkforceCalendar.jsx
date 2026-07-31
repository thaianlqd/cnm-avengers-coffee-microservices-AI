import React, { Fragment } from 'react'
import { ChevronLeft, ChevronRight, Calendar, User, Clock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { getAttendanceInsight, getAttendanceToneClass, getMonday, toDateOnlyLocal } from '../../workforce/attendance'

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const SLOT_ORDER = ['SANG', 'CHIEU', 'TOI']
const SLOT_LABEL = {
  SANG: 'Ca Sáng',
  CHIEU: 'Ca Chiều',
  TOI: 'Ca Tối',
}

function sourceLabel(item) {
  const source = String(item?.nguon_tao || '').toUpperCase()
  if (source === 'MANAGER_ASSIGNMENT') return 'Manager phân công'
  if (source === 'STAFF_REQUEST') return 'Staff đăng ký'
  if (source === 'MANAGER_REQUEST') return 'Manager tự đăng ký'
  return source || 'Khác'
}

function roleLabel(item) {
  return String(item?.vai_tro || '').toUpperCase() || 'STAFF'
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatDayHeader(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatWeekRange(start) {
  const end = addDays(start, 6)
  const startText = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`
  const endText = `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`
  return `${startText} - ${endText}/${end.getFullYear()}`
}

export function WorkforceCalendar({
  items = [],
  weekStart,
  onChangeWeek,
  onResetWeek,
  onSelectItem,
  selectedItemId,
  mode = 'staff',
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

  return (
    <section style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      padding: '1.25rem',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
      marginBottom: '1.25rem'
    }}>
      {/* Calendar Navigation Toolbar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.85rem',
        marginBottom: '1.25rem',
        paddingBottom: '0.85rem',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Calendar size={20} color="#10b981" /> Lịch làm việc theo tuần
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
            Thời gian: <strong>{formatWeekRange(weekStart)}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => onChangeWeek(-1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.45rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.825rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={16} /> Tuần trước
          </button>

          <button
            type="button"
            onClick={onResetWeek}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.45rem 0.8rem',
              borderRadius: '8px',
              border: 'none',
              background: '#eff6ff',
              color: '#2563eb',
              fontSize: '0.825rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <Calendar size={14} /> Hiện tại
          </button>

          <button
            type="button"
            onClick={() => onChangeWeek(1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.45rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.825rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Tuần sau <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '110px repeat(7, minmax(130px, 1fr))',
        gap: '1px',
        background: '#e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header corner */}
        <div style={{
          background: '#f8fafc',
          padding: '0.75rem',
          fontSize: '0.825rem',
          fontWeight: '700',
          color: '#475569',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          Ca làm
        </div>

        {/* Days Header */}
        {days.map((day, index) => {
          const isToday = toDateOnlyLocal(day) === toDateOnlyLocal(new Date())
          return (
            <div
              key={toDateOnlyLocal(day)}
              style={{
                background: isToday ? '#ecfdf5' : '#f8fafc',
                padding: '0.75rem 0.5rem',
                textAlign: 'center',
                borderBottom: '2px solid',
                borderColor: isToday ? '#10b981' : 'transparent'
              }}
            >
              <strong style={{ display: 'block', fontSize: '0.85rem', color: isToday ? '#047857' : '#1e293b' }}>
                {DAY_LABELS[index]}
              </strong>
              <span style={{ fontSize: '0.75rem', color: isToday ? '#059669' : '#64748b', fontWeight: '600' }}>
                {formatDayHeader(day)}
              </span>
            </div>
          )
        })}

        {/* Slots Rows */}
        {SLOT_ORDER.map((slot) => (
          <Fragment key={slot}>
            {/* Slot Label Cell */}
            <div style={{
              background: '#ffffff',
              padding: '0.75rem 0.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              borderRight: '1px solid #e2e8f0'
            }}>
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{SLOT_LABEL[slot]}</strong>
              <span style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', marginTop: '0.15rem' }}>
                {slot === 'SANG' ? '07:00 - 12:00' : slot === 'CHIEU' ? '12:00 - 17:00' : '17:00 - 22:00'}
              </span>
            </div>

            {/* Cell For Each Day */}
            {days.map((day) => {
              const dayKey = toDateOnlyLocal(day)
              const cellItems = items.filter((item) => item.ngay_lam_viec === dayKey && item.ma_khung_ca === slot)

              return (
                <div
                  key={`${slot}-${dayKey}`}
                  style={{
                    background: '#ffffff',
                    padding: '0.5rem',
                    minHeight: '85px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                  }}
                >
                  {cellItems.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontStyle: 'italic', textAlign: 'center', margin: 'auto' }}>
                      Trống
                    </span>
                  ) : (
                    cellItems.map((item) => {
                      const insight = getAttendanceInsight(item)
                      const isSelected = selectedItemId === item.ma_ca_lam_viec

                      return (
                        <button
                          key={item.ma_ca_lam_viec}
                          type="button"
                          onClick={() => onSelectItem?.(item)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.5rem 0.6rem',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid #10b981' : '1px solid #cbd5e1',
                            background: isSelected ? '#ecfdf5' : '#f8fafc',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                            boxShadow: isSelected ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <strong style={{ fontSize: '0.8rem', color: '#0f172a', lineHeight: 1.2 }}>
                            {mode === 'manager' ? item.staff_name || item.staff_username : item.ten_ca}
                          </strong>

                          {mode === 'manager' && (
                            <span style={{ fontSize: '0.7rem', color: '#475569' }}>
                              {item.staff_username} • {roleLabel(item)}
                            </span>
                          )}

                          <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: '500' }}>
                            {item.gio_bat_dau} - {item.gio_ket_thuc}
                          </span>

                          <span style={{
                            fontSize: '0.675rem',
                            fontWeight: '700',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: insight.isLate || insight.leftEarly ? '#fef3c7' : '#d1fae5',
                            color: insight.isLate || insight.leftEarly ? '#b45309' : '#047857',
                            width: 'fit-content'
                          }}>
                            {insight.shortLabel}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </section>
  )
}

export function getInitialWeekStart() {
  return getMonday(new Date())
}
