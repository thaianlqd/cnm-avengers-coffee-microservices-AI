import { useContext, useState } from 'react'
import { WorkspacePageContext } from './WorkspacePageContext'
import { WorkspaceSearch } from './WorkspaceNavigation'
import { ChevronRight, Store } from './WorkspaceIcons'
import { AdminNotificationBell } from '../../features/shared/components/AdminNotificationBell'
import { TopbarUserDropdown } from '../../features/shared/components/UserProfileModals'

const descriptions = {
  overview: 'Theo dõi doanh thu, đơn hàng và sản phẩm của cửa hàng.',
  orders: 'Tìm đơn, xem chi tiết và xử lý bước tiếp theo trong cùng một danh sách.',
  pos: 'Chọn món, kiểm tra hóa đơn và nhận thanh toán tại quầy.',
  delivery: 'Điều phối giao hàng, đối soát COD và quản lý tài xế của cơ sở.',
  menu: 'Tìm sản phẩm và bật hoặc tạm ngưng bán theo tình hình cửa hàng.',
  shift: 'Kiểm đếm tiền thực tế, đối chiếu hệ thống và bàn giao ca.',
  'shift-approval': 'Kiểm tra chênh lệch và phê duyệt biên bản chốt ca của nhân viên.',
  'employee-manage': 'Danh sách nhân viên cửa hàng, thông tin liên hệ và tình trạng làm việc.',
  'workforce-manage': 'Phân ca, xử lý đăng ký và theo dõi lịch làm của nhân viên.',
  'shipper-manage': 'Theo dõi tài xế, phân công giao hàng và xử lý ngoại lệ.',
  messages: 'Theo dõi hội thoại và trả lời khách hàng.',
  workforce: 'Xem lịch làm, giờ vào ca và kết quả chấm công của bạn.',
  'table-management': 'Theo dõi khu vực, bàn và các đơn đang phục vụ.',
  'customer-care': 'Xem đánh giá và phản hồi trải nghiệm tại cửa hàng.',
  'survey-manage': 'Quản lý biểu mẫu khảo sát và phản hồi của khách hàng.',
  news: 'Quản lý bài viết và thông tin cửa hàng.',
  account: 'Cập nhật thông tin và bảo mật tài khoản.',
}

/** The operational shell owns page identity; panels retain their state and actions. */
export default function OperationalPageFrame({ groups, activeTab, onSelect, session, onLogout, branchName, pageDescriptions = {}, headingActions, headerContext, children }) {
  const [detail, setDetail] = useState(null)
  const group = groups.find(group => group.items.some(item => item.id === activeTab))
  const page = group?.items.find(item => item.id === activeTab)
  const title = detail?.title || page?.label || 'Tài khoản'
  return <WorkspacePageContext.Provider value={setDetail}>
    <header className="operational-header">
      <div className="operational-header-location"><nav aria-label="Đường dẫn" className="operational-breadcrumb"><Store size={16} /><span>{branchName}</span><ChevronRight size={14} /><span>{group?.label || 'Cửa hàng'}</span></nav></div>
      <div className="operational-header-actions">{headerContext && <div className="operational-header-context">{headerContext}</div>}<WorkspaceSearch items={groups.flatMap(group => group.items.map(item => ({ ...item, group: group.label })))} onSelect={onSelect} /><AdminNotificationBell session={session} /><TopbarUserDropdown session={session} onLogout={onLogout} /></div>
    </header>
    <div className="operational-page" data-screen={activeTab}>
      <div className="operational-page-heading"><div><h1>{title}</h1><p>{detail?.description || pageDescriptions[activeTab] || descriptions[activeTab] || 'Quản lý thông tin và hoạt động cửa hàng.'}</p></div>{headingActions&&<div className="operational-heading-actions">{headingActions}</div>}</div>
      {children}
    </div>
  </WorkspacePageContext.Provider>
}

/** Preserve standalone panels while suppressing duplicate introductions in a page frame. */
export function WorkspacePanelIntro({ children }) {
  const owner = useContext(WorkspacePageContext)
  return owner ? null : children
}
