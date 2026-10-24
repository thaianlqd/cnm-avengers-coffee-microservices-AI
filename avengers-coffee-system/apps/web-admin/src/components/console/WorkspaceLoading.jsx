import { useEffect, useState } from 'react'
import { DashboardSkeleton } from './DashboardCharts'
import { Button } from '../ui/button'
import { RefreshCw } from './WorkspaceIcons'

export default function WorkspaceLoading({ delayMs = 12000, onReload = () => window.location.reload() }) {
  const [slow,setSlow] = useState(false)
  useEffect(() => { const timer=setTimeout(()=>setSlow(true),delayMs); return()=>clearTimeout(timer) },[delayMs])
  if (!slow) return <DashboardSkeleton />
  return <section className="workspace-slow-load" role="alert"><h2>Giao diện đang tải lâu hơn bình thường</h2><p>Kiểm tra kết nối và tải lại để lấy phiên bản giao diện mới nhất.</p><Button variant="outline" onClick={onReload}><RefreshCw size={16}/>Tải lại giao diện</Button></section>
}
