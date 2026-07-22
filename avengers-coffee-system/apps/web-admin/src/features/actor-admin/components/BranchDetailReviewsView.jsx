import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../admin-dashboard/constants';

export function BranchDetailReviewsView({ branch, onBack }) {
  const [reviewsData, setReviewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [starFilter, setStarFilter] = useState('ALL');

  const branchCode = branch?.ma_chi_nhanh || branch?.code || branch?.id;

  const fetchReviews = async () => {
    if (!branchCode) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/branch-reviews/branch/${branchCode}`);
      if (!response.ok) {
        throw new Error('Lỗi khi lấy dữ liệu đánh giá chi nhánh');
      }
      const data = await response.json();
      setReviewsData(data);
    } catch (err) {
      console.error('Error fetching branch review details:', err);
      setError('Không thể tải dữ liệu đánh giá chi nhánh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [branchCode]);

  const items = reviewsData?.items || [];
  const filteredItems = items.filter((r) => {
    if (starFilter === 'ALL') return true;
    return r.diem_tong_quan === Number(starFilter);
  });

  const criteria = reviewsData?.tieu_chi_trung_binh || {
    phuc_vu: 5,
    ve_sinh: 5,
    toc_do: 5,
    chat_luong_mon: 5,
  };

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '20px', border: '1px solid #efeae0' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #f6f3ed' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: '#c41230',
            color: '#fff',
            border: 'none',
            borderRadius: '30px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(196, 18, 48, 0.2)',
            transition: 'all 0.2s',
          }}
        >
          ← Quay lại danh sách chi nhánh
        </button>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#84746a', textTransform: 'uppercase' }}>Mã chi nhánh</span>
          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1a1a1a' }}>{branchCode}</h4>
        </div>
      </div>

      {/* Branch Title & Meta Info */}
      <div style={{ background: '#faf8f5', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px', border: '1px solid #eee7dd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#1a1a1a', margin: '0 0 6px 0', textTransform: 'uppercase' }}>
              🏬 {branch?.ten_chi_nhanh || branch?.name || 'Chi nhánh Avengers Coffee'}
            </h2>
            <p style={{ fontSize: '13px', color: '#685950', margin: 0, fontWeight: 500 }}>
              📍 <strong>Địa chỉ:</strong> {branch?.dia_chi || 'Chưa cập nhật'} • 📞 <strong>SĐT:</strong> {branch?.so_dien_thoai || 'Chưa cập nhật'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '12px 20px', borderRadius: '14px', border: '1px solid #e5dfd5' }}>
            <span style={{ fontSize: '28px' }}>⭐</span>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#ca8a04' }}>
                {reviewsData?.diem_trung_binh || 5.0} / 5.0
              </div>
              <div style={{ fontSize: '11px', color: '#84746a', fontWeight: 600 }}>
                {reviewsData?.tong_luot_danh_gia || 0} lượt đánh giá từ khách
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#84746a', fontWeight: 500 }}>
          ☕ Đang tải đánh giá chi nhánh...
        </div>
      ) : error ? (
        <div style={{ padding: '20px', background: '#ffebeb', color: '#c41230', borderRadius: '12px', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Criteria Performance Cards */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', color: '#5c4d44', marginBottom: '14px', letterSpacing: '0.04em' }}>
              📊 Thống kê theo 4 Tiêu chí phục vụ
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div style={{ background: '#fffcf5', border: '1px solid #fef08a', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a16207', textTransform: 'uppercase' }}>Thái độ phục vụ</span>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#ca8a04', marginTop: '4px' }}>
                  ⭐ {criteria.phuc_vu || 5.0}
                </div>
              </div>

              <div style={{ background: '#fffcf5', border: '1px solid #fef08a', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a16207', textTransform: 'uppercase' }}>Không gian & Vệ sinh</span>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#ca8a04', marginTop: '4px' }}>
                  ⭐ {criteria.ve_sinh || 5.0}
                </div>
              </div>

              <div style={{ background: '#fffcf5', border: '1px solid #fef08a', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a16207', textTransform: 'uppercase' }}>Tốc độ lên món</span>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#ca8a04', marginTop: '4px' }}>
                  ⭐ {criteria.toc_do || 5.0}
                </div>
              </div>

              <div style={{ background: '#fffcf5', border: '1px solid #fef08a', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#a16207', textTransform: 'uppercase' }}>Chất lượng đồ uống</span>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#ca8a04', marginTop: '4px' }}>
                  ⭐ {criteria.chat_luong_mon || 5.0}
                </div>
              </div>
            </div>
          </div>

          {/* Star Filter & Reviews List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', color: '#5c4d44', margin: 0, letterSpacing: '0.04em' }}>
                💬 Danh sách nhận xét khách hàng ({filteredItems.length})
              </h3>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['ALL', '5', '4', '3', '2', '1'].map((star) => {
                  const isActive = starFilter === star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setStarFilter(star)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: '1px solid #e1dacf',
                        background: isActive ? '#1a1a1a' : '#fff',
                        color: isActive ? '#fff' : '#5c4d44',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {star === 'ALL' ? 'Tất cả' : `${star} Sao ⭐`}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#84746a', background: '#faf8f5', borderRadius: '16px', border: '1px dashed #e5dfd5' }}>
                <p style={{ fontSize: '24px', margin: '0 0 8px 0' }}>⭐</p>
                <p style={{ fontWeight: 700, fontSize: '14px', margin: 0 }}>Chưa có nhận xét nào phù hợp với bộ lọc</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredItems.map((r) => (
                  <div key={r.id} style={{ background: '#faf8f5', border: '1px solid #efeae0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 800, fontSize: '14px', color: '#1a1a1a' }}>
                          👤 {r.ten_nguoi_dung || 'Khách hàng'}
                        </span>
                        <span style={{ background: '#fef08a', color: '#854d0e', fontWeight: 800, fontSize: '11px', padding: '2px 8px', borderRadius: '12px' }}>
                          ⭐ {r.diem_tong_quan} / 5 Sao
                        </span>
                        {r.ma_don_hang && (
                          <span style={{ fontSize: '11px', color: '#685950', background: '#fff', padding: '2px 8px', borderRadius: '8px', border: '1px solid #e5dfd5' }}>
                            📦 Đơn: #{r.ma_don_hang}
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: '11px', color: '#84746a', fontWeight: 500 }}>
                        {new Date(r.ngay_tao).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    {r.nhan_xet ? (
                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#333', background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #eee7dd', fontStyle: 'italic' }}>
                        "{r.nhan_xet}"
                      </p>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#a89d94', fontStyle: 'italic' }}>(Khách hàng không để lại lời nhắn)</span>
                    )}

                    {r.tieu_chi && (
                      <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '11px', color: '#685950', fontWeight: 600 }}>
                        <span>Phục vụ: ⭐{r.tieu_chi.phuc_vu || r.diem_tong_quan}</span>
                        <span>Vệ sinh: ⭐{r.tieu_chi.ve_sinh || r.diem_tong_quan}</span>
                        <span>Tốc độ: ⭐{r.tieu_chi.toc_do || r.diem_tong_quan}</span>
                        <span>Món: ⭐{r.tieu_chi.chat_luong_mon || r.diem_tong_quan}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
