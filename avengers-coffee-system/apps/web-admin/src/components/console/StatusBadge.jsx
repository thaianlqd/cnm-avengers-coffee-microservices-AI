import { Badge } from '../ui/badge'
import { CheckCircle2, XCircle, Clock } from './WorkspaceIcons'

/** Shared visual status only; labels and business status values stay with callers. */
export default function StatusBadge({ status, tone, children, className = '', ...props }) {
  const value = String(status ?? '').toUpperCase()
  const resolved = tone || (status === true || status === 1 || /^(ACTIVE|AVAILABLE|COMPLETED|DELIVERED|APPROVED|PAID|CHECKED_IN|DANG_HOAT_DONG|DA_DUYET|DA_GIAO|DA_THANH_TOAN|DA_XAC_NHAN|HOAN_THANH|CONFIRMED|SUCCESS)$/.test(value)
    ? 'success' : /^(CANCELLED|CANCELED|REJECTED|FAILED|TU_CHOI|DA_HUY|HUY|DONG_CUA|QUA_HAN|ABSENT)$/.test(value)
      ? 'destructive' : /^(PENDING|PROCESSING|SCHEDULED|LATE|IN_TRANSIT|PICKING_UP|CHO_|CON_NO|DA_DAT|DANG_THIET_LAP|DANG_GIAO|DANG_XU_LY|MOI|DANG_CHUAN_BI)/.test(value) ? 'warning' : 'secondary')
  const Icon = resolved === 'success' ? CheckCircle2 : resolved === 'warning' ? Clock : XCircle
  return <Badge {...props} variant={resolved} className={`workspace-status-badge ${className}`}><Icon size={13} aria-hidden="true" /><span>{children || status || 'Chưa cập nhật'}</span></Badge>
}
