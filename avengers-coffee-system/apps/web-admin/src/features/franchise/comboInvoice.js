export const comboStatusLabel = status => ({ DA_DAT: 'Chờ chấp nhận', DA_XAC_NHAN: 'Đã chấp nhận', DA_GIAO: 'Đã giao', TAM_HOAN: 'Tạm hoãn' }[status] || 'Chưa xác định')
export const comboIsPaid = order => Boolean(order.da_thanh_toan || order.thanh_toan_ngay)
export const comboHasInvoice = order => ['DA_XAC_NHAN', 'DA_GIAO'].includes(order.trang_thai)
export const comboInvoiceNumber = order => `CB-${String(order.id).replaceAll('-', '').toUpperCase()}`
const money = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`
const date = value => value ? new Date(value).toLocaleDateString('vi-VN') : '—'

// The same renderer serves download, preview and print. No payment state is inferred from delivery.
export async function createComboInvoice(order, fontBase64) {
  if (!comboHasInvoice(order)) throw new Error('Hóa đơn chỉ có sau khi đơn được chấp nhận.')
  const { jsPDF } = await import('jspdf')
  if (!fontBase64) {
    const response = await fetch('/fonts/invoice-sans.ttf')
    if (!response.ok) throw new Error('Không tải được phông chữ hóa đơn. Vui lòng thử lại.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
    fontBase64 = btoa(binary)
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('invoice-sans.ttf', fontBase64)
  doc.addFont('invoice-sans.ttf', 'InvoiceSans', 'normal')
  doc.setFont('InvoiceSans')
  doc.setProperties({ title: `Hóa đơn ${comboInvoiceNumber(order)}`, subject: 'Đơn mua combo nguyên liệu', author: 'Avengers Coffee' })
  const line = (value, x, y, size = 10, color = '#263c50') => { doc.setFontSize(size); doc.setTextColor(color); doc.text(String(value), x, y) }
  line('AVENGERS COFFEE', 20, 25, 15, '#16354d')
  line('HÓA ĐƠN ĐƠN COMBO', 20, 40, 20, '#16354d')
  line(comboInvoiceNumber(order), 20, 49, 8)
  doc.setDrawColor('#dce5ed'); doc.line(20, 57, 190, 57)
  line('ĐIỂM BÁN', 20, 69, 9, '#526174')
  const kioskLines = doc.splitTextToSize(order.kiosk?.ten_kiosk || order.kiosk?.ma_kiosk || order.kiosk_id || 'Kiosk', 112)
  // jsPDF accepts arrays as separate lines; keep potentially long names away from the stamp.
  doc.setFontSize(12); doc.setTextColor('#263c50'); doc.text(kioskLines, 20, 78)
  const metaY = 82 + kioskLines.length * 6
  line(`Mã kiosk: ${order.kiosk?.ma_kiosk || '—'}`, 20, metaY, 10)
  line(`Ngày đặt: ${date(order.ngay_dat || order.ngay_tao)}`, 20, metaY + 8)
  line(`Hạn thanh toán: ${date(order.han_thanh_toan)}`, 20, metaY + 16)
  if (comboIsPaid(order)) {
    doc.setDrawColor('#16803d'); doc.setTextColor('#16803d'); doc.setLineWidth(0.7)
    doc.roundedRect(142, 66, 48, 18, 2, 2)
    doc.setFontSize(10); doc.text('ĐÃ THANH TOÁN', 166, 77, { align: 'center' })
  }
  const tableY = Math.max(123, metaY + 30)
  doc.setFillColor('#eef3f7'); doc.rect(20, tableY, 170, 13, 'F')
  line('Nội dung', 24, tableY + 8, 9); line('SL', 127, tableY + 8, 9)
  line('Đơn giá', 142, tableY + 8, 9); line('Thành tiền', 171, tableY + 8, 9)
  doc.setFontSize(10)
  const productLines = doc.splitTextToSize(order.combo?.ten_combo || 'Combo nguyên liệu', 92)
  doc.text(productLines, 24, tableY + 23)
  const right = (value, x) => { doc.setFontSize(9); doc.text(value, x, tableY + 23, { align: 'right' }) }
  right(String(order.so_luong), 132); right(money(order.don_gia), 164); right(money(order.tong_tien), 187)
  const totalY = tableY + Math.max(35, productLines.length * 6 + 22)
  doc.setDrawColor('#dce5ed'); doc.line(20, totalY, 190, totalY)
  line('Tổng thanh toán', 20, totalY + 15, 12, '#16354d')
  doc.setFontSize(15); doc.setTextColor('#16354d'); doc.text(money(order.tong_tien), 190, totalY + 15, { align: 'right' })
  line(comboIsPaid(order) ? 'Đã thanh toán qua hệ thống / đã được xác nhận thu.' : 'Chưa thanh toán. Vui lòng thanh toán theo hạn của đơn.', 20, totalY + 30, 9)
  doc.setDrawColor('#dce5ed'); doc.line(20, 266, 190, 266)
  line('Chứng từ đơn hàng trong hệ thống, không thay thế hóa đơn điện tử thuế.', 20, 275, 8, '#526174')
  line('1 / 1', 181, 284, 8, '#526174')
  return doc
}

export async function openComboInvoice(order, mode = 'download') {
  // Reserve the preview window synchronously so a user click is not blocked as a popup.
  const preview = mode === 'download' ? null : window.open('about:blank', '_blank')
  try {
    if (mode !== 'download' && !preview) throw new Error('Trình duyệt đang chặn cửa sổ hóa đơn. Hãy cho phép cửa sổ bật lên hoặc tải PDF.')
    const doc = await createComboInvoice(order)
    if (mode === 'download') doc.save(`${comboInvoiceNumber(order)}.pdf`)
    else {
      if (mode === 'print') doc.autoPrint()
      const url = URL.createObjectURL(doc.output('blob'))
      preview.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
  } catch (error) { preview?.close(); throw error }
}
