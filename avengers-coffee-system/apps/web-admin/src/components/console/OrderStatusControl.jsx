import { Button } from '../ui/button'
import { ArrowRight, CheckCircle2 } from './WorkspaceIcons'
import { ORDER_STATUS_LABEL } from '../../features/admin-dashboard/constants'

const actions = { DA_XAC_NHAN: 'Xác nhận đơn', DANG_CHUAN_BI: 'Chuẩn bị món', DANG_GIAO: 'Bàn giao giao hàng', HOAN_THANH: 'Hoàn thành đơn' }
const STORE_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'HOAN_THANH']
const DELIVERY_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH']
const STEP_LABEL = { MOI_TAO: 'Mới tạo', DA_XAC_NHAN: 'Xác nhận', DANG_CHUAN_BI: 'Chuẩn bị', DANG_GIAO: 'Đang giao', HOAN_THANH: 'Hoàn tất' }

export default function OrderStatusControl({ current, options, busy, onChange, isDelivery = false }) {
  const flow = isDelivery || options.includes('DANG_GIAO') ? DELIVERY_FLOW : STORE_FLOW
  if (current === 'DA_HUY') return null
  const visibleFlow = flow
  const currentStep = visibleFlow.indexOf(current)
  const next = options.find(value => value !== current && value !== 'DA_HUY')
  const remaining = options.filter(value => value !== current)
  const terminal = current === 'HOAN_THANH' || current === 'DA_HUY' || !remaining.length
  const activeStep = current === 'DA_HUY' ? -1 : currentStep
  return <div className="order-status-control">
    <ol className={`order-progress ${current === 'DA_HUY' ? 'is-cancelled' : ''}`} style={{ '--order-step-count': visibleFlow.length }} aria-label={`Tiến trình đơn hàng: ${ORDER_STATUS_LABEL[current] || current}`}>
      {visibleFlow.map((step, index) => <li key={step} className={current === 'DA_HUY' ? 'is-cancelled' : index < activeStep ? 'is-complete' : index === activeStep ? 'is-current' : ''} aria-current={index === activeStep ? 'step' : undefined}>
        <span className="order-progress-mark">{index < activeStep ? <CheckCircle2 size={13} /> : <i aria-hidden="true" />}</span>
        <span>{step === 'DA_HUY' ? 'Đã hủy' : STEP_LABEL[step] || ORDER_STATUS_LABEL[step] || step}</span>
      </li>)}
    </ol>
    {terminal ? <span className="order-terminal"><CheckCircle2 size={14} />{current === 'DA_HUY' ? 'Đơn đã hủy' : 'Đã kết thúc'}</span> : next && <Button className="admin-button-primary" data-intent="success" disabled={busy} onClick={() => onChange(next)}>{busy ? 'Đang cập nhật…' : actions[next] || ORDER_STATUS_LABEL[next]}<ArrowRight size={14} /></Button>}
  </div>
}
