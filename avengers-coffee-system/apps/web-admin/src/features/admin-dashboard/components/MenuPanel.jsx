import { fmtMoney, normalizeViText } from '../utils'

export function MenuPanel({
  inventoryState,
  stockDrafts,
  setStockDrafts,
  savingStockId,
  savingMenuStatusId,
  onSaveStock,
  onToggleSelling,
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sức khỏe thực đơn và tồn kho</h2>
        <span>Dữ liệu thật từ menu + inventory. Có thể tạm ngưng bán thủ công từng món.</span>
      </div>
      <div className="menu-table">
        {inventoryState.loading ? <p>Đang tải thực đơn và tồn kho...</p> : null}
        {inventoryState.error ? <p className="error-text">{inventoryState.error}</p> : null}
        {!inventoryState.loading && !inventoryState.error && !inventoryState.items.length ? (
          <p>Không có dữ liệu món/tồn kho.</p>
        ) : null}
        {inventoryState.items.map((item) => (
          <article key={item.ma_san_pham}>
            <div>
              <h3>{normalizeViText(item.name)}</h3>
              <p>
                Mã SP: {item.ma_san_pham} - Danh mục: {item.category || 'Khác'} - Giá: {fmtMoney(item.price)}
              </p>
            </div>
            <div className="inventory-editor">
              <label htmlFor={`stock-${item.ma_san_pham}`}>Tồn kho</label>
              <input
                id={`stock-${item.ma_san_pham}`}
                type="number"
                min="0"
                value={stockDrafts[item.ma_san_pham] ?? item.so_luong_ton}
                onChange={(e) =>
                  setStockDrafts((prev) => ({
                    ...prev,
                    [item.ma_san_pham]: Number(e.target.value || 0),
                  }))
                }
              />
              <p className="inventory-badge">
                Trạng thái bán: {item.dang_ban ? 'Đang bán' : 'Tạm ngưng bán'}
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => onToggleSelling(item.ma_san_pham, !item.dang_ban)}
                disabled={savingMenuStatusId === item.ma_san_pham}
              >
                {savingMenuStatusId === item.ma_san_pham
                  ? 'Đang cập nhật...'
                  : item.dang_ban
                    ? 'Đánh dấu tạm hết'
                    : 'Mở bán lại'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => onSaveStock(item.ma_san_pham)}
              disabled={savingStockId === item.ma_san_pham}
            >
              {savingStockId === item.ma_san_pham ? 'Đang lưu...' : 'Lưu tồn kho'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
