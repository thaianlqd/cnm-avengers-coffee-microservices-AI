import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Store,
  MapPin,
  Phone,
  Clock,
  Star,
  Smile,
  Sparkles,
  Zap,
  Coffee,
  MessageSquare,
  MessageSquareDashed,
  ExternalLink,
  RefreshCw,
  Award,
  CheckCircle2,
  User,
  ShoppingBag
} from 'lucide-react';
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
  
  // Calculate counts per star rating
  const starCounts = useMemo(() => {
    const counts = { ALL: items.length, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    items.forEach((r) => {
      const score = String(Math.round(r.diem_tong_quan || 5));
      if (counts[score] !== undefined) {
        counts[score] += 1;
      }
    });
    return counts;
  }, [items]);

  const filteredItems = items.filter((r) => {
    if (starFilter === 'ALL') return true;
    return Math.round(r.diem_tong_quan || 5) === Number(starFilter);
  });

  const criteria = reviewsData?.tieu_chi_trung_binh || {
    phuc_vu: 5.0,
    ve_sinh: 5.0,
    toc_do: 5.0,
    chat_luong_mon: 5.0,
  };

  const avgRating = reviewsData?.diem_trung_binh || 5.0;
  const totalReviews = reviewsData?.tong_luot_danh_gia || items.length || 0;

  const renderStars = (rating = 5, size = 16) => {
    const rounded = Math.round(rating);
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={size}
            fill={s <= rounded ? '#f59e0b' : '#e2e8f0'}
            color={s <= rounded ? '#d97706' : '#cbd5e1'}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="branch-detail-view-container" style={{ padding: '1.75rem', backgroundColor: '#f8fafc', borderRadius: '1rem', minHeight: '100%' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 1.2rem',
            background: 'linear-[#ffffff]',
            backgroundColor: '#ffffff',
            color: '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: '9999px',
            fontWeight: '600',
            fontSize: '0.875rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
            transition: 'all 0.2s ease'
          }}
        >
          <ArrowLeft size={16} color="#475569" />
          <span>Quay lại danh sách chi nhánh</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={fetchReviews}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.9rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              fontWeight: '500',
              color: '#475569',
              cursor: 'pointer'
            }}
            title="Làm mới dữ liệu đánh giá"
          >
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
            <span>Tải lại</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#e0e7ff', border: '1px solid #c7d2fe', padding: '0.35rem 0.75rem', borderRadius: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#4338ca', textTransform: 'uppercase' }}>Mã chi nhánh:</span>
            <strong style={{ fontSize: '0.85rem', fontWeight: '800', color: '#3730a3', fontFamily: 'monospace' }}>{branchCode}</strong>
          </div>
        </div>
      </div>

      {/* Branch Hero Overview Banner Card */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.05)', padding: '1.75rem', marginBottom: '1.75rem', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #4f46e5 0%, #10b981 50%, #f59e0b 100%)' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>
            {/* Branch Image Thumbnail or Avatar Icon */}
            <div style={{ width: '4rem', height: '4rem', borderRadius: '1rem', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #c7d2fe', flexShrink: 0, boxShadow: '0 2px 8px rgba(79, 70, 229, 0.15)' }}>
              {branch?.hinh_anh_url ? (
                <img src={branch.hinh_anh_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1rem' }} />
              ) : (
                <Store size={32} />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                  {branch?.ten_chi_nhanh || branch?.name || 'Chi nhánh Avengers Coffee'}
                </h1>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  backgroundColor: branch?.trang_thai === 'ACTIVE' ? '#ecfdf5' : '#fef2f2',
                  color: branch?.trang_thai === 'ACTIVE' ? '#059669' : '#dc2626',
                  border: branch?.trang_thai === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #fee2e2'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: branch?.trang_thai === 'ACTIVE' ? '#10b981' : '#ef4444' }}></span>
                  {branch?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm dừng'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MapPin size={15} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: '500' }}>{branch?.dia_chi || 'Chưa cập nhật địa chỉ'}</span>
                  {branch?.map_url && (
                    <a href={branch.map_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none', marginLeft: '0.3rem' }}>
                      Maps <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Phone size={14} color="#10b981" />
                    <span>{branch?.so_dien_thoai || 'Chưa cập nhật SĐT'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={14} color="#f59e0b" />
                    <span>Mở cửa: {branch?.gio_mo_cua || '07:00'} - {branch?.gio_dong_cua || '22:00'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overall Rating Score Card Widget */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', backgroundColor: '#fffbeb', border: '1px solid #fef08a', padding: '1rem 1.35rem', borderRadius: '0.875rem', boxShadow: '0 2px 6px rgba(245, 158, 11, 0.08)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: '900', color: '#b45309', lineHeight: '1.1' }}>
                {Number(avgRating).toFixed(1)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: '600', marginTop: '0.1rem' }}>trên 5.0</div>
            </div>

            <div style={{ height: '2.5rem', width: '1px', backgroundColor: '#fde68a' }}></div>

            <div>
              <div style={{ marginBottom: '0.25rem' }}>{renderStars(avgRating, 18)}</div>
              <div style={{ fontSize: '0.78125rem', color: '#92400e', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Award size={13} color="#d97706" />
                <span>{totalReviews} lượt đánh giá thực tế</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '1rem', padding: '4rem 2rem', textAlign: 'center', color: '#64748b', border: '1px solid #e2e8f0' }}>
          <Coffee size={36} color="#3b82f6" className="spin-icon" style={{ marginBottom: '0.75rem' }} />
          <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9375rem' }}>Đang tải dữ liệu đánh giá chi nhánh...</p>
        </div>
      ) : error ? (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '1rem', padding: '1.5rem', color: '#dc2626', fontWeight: '600', textAlign: 'center' }}>
          ⚠️ {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* 4 Service Evaluation Criteria Stat Cards */}
          <div>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <Award size={18} color="#4f46e5" /> Thống kê theo 4 Tiêu chí Phục vụ
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
              {/* Criteria 1: Service Attitude */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.875rem', padding: '1.1rem 1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Thái độ phục vụ</span>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Smile size={16} color="#059669" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a' }}>{Number(criteria.phuc_vu || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '6px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#10b981', height: '100%', width: `${(Number(criteria.phuc_vu || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>

              {/* Criteria 2: Cleanliness & Space */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.875rem', padding: '1.1rem 1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Không gian &amp; Vệ sinh</span>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={16} color="#2563eb" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a' }}>{Number(criteria.ve_sinh || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '6px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#3b82f6', height: '100%', width: `${(Number(criteria.ve_sinh || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>

              {/* Criteria 3: Service Speed */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.875rem', padding: '1.1rem 1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Tốc độ lên món</span>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={16} color="#d97706" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a' }}>{Number(criteria.toc_do || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '6px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f59e0b', height: '100%', width: `${(Number(criteria.toc_do || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>

              {/* Criteria 4: Drink & Food Quality */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.875rem', padding: '1.1rem 1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Chất lượng đồ uống</span>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Coffee size={16} color="#7c3aed" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a' }}>{Number(criteria.chat_luong_mon || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '6px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#8b5cf6', height: '100%', width: `${(Number(criteria.chat_luong_mon || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Star Filter Bar & Reviews List */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '1rem', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', pb: '0.85rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={18} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a' }}>
                  Danh sách Nhận xét Khách hàng ({filteredItems.length})
                </h3>
              </div>

              {/* Rating Filter Pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {['ALL', '5', '4', '3', '2', '1'].map((star) => {
                  const isActive = starFilter === star;
                  const count = starCounts[star] || 0;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setStarFilter(star)}
                      style={{
                        padding: '0.35rem 0.8rem',
                        borderRadius: '9999px',
                        border: isActive ? '1px solid #312e81' : '1px solid #cbd5e1',
                        backgroundColor: isActive ? '#1e1b4b' : '#ffffff',
                        color: isActive ? '#ffffff' : '#475569',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {star === 'ALL' ? (
                        <span>Tất cả ({count})</span>
                      ) : (
                        <>
                          <span>{star} Sao</span>
                          <Star size={12} fill={isActive ? '#f59e0b' : '#fbbf24'} color={isActive ? '#d97706' : '#f59e0b'} />
                          <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>({count})</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Empty State */}
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', backgroundColor: '#f8fafc', borderRadius: '0.875rem', border: '1px dashed #cbd5e1' }}>
                <MessageSquareDashed size={42} color="#94a3b8" style={{ marginBottom: '0.65rem' }} />
                <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#334155' }}>Chưa có nhận xét nào phù hợp với bộ lọc</h4>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>Thử chọn mức sao khác để xem đánh giá tương ứng</p>
              </div>
            ) : (
              /* Review Cards List */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredItems.map((r) => {
                  const customerName = r.ten_nguoi_dung || 'Khách hàng Avengers Coffee';
                  const firstChar = customerName.charAt(0).toUpperCase();

                  return (
                    <div key={r.id || Math.random()} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)', transition: 'all 0.15s ease' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4338ca', fontWeight: '700', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #c7d2fe', flexShrink: 0 }}>
                            {firstChar}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{customerName}</strong>
                              <span style={{ backgroundColor: '#d1fae5', color: '#047857', fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.45rem', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <CheckCircle2 size={10} /> Đã mua hàng
                              </span>
                              {r.ma_don_hang && (
                                <span style={{ fontSize: '0.72rem', color: '#475569', backgroundColor: '#f1f5f9', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <ShoppingBag size={11} color="#64748b" /> #{r.ma_don_hang}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.1rem', display: 'block' }}>
                              {r.ngay_tao ? new Date(r.ngay_tao).toLocaleString('vi-VN') : 'Mới đây'}
                            </span>
                          </div>
                        </div>

                        {/* Overall Rating Pill */}
                        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '0.25rem 0.65rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {renderStars(r.diem_tong_quan || 5, 14)}
                          <span style={{ fontSize: '0.78125rem', fontWeight: '800', color: '#b45309' }}>
                            {Number(r.diem_tong_quan || 5).toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Comment text */}
                      {r.nhan_xet ? (
                        <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '0.625rem', borderLeft: '3px solid #3b82f6', fontSize: '0.85rem', color: '#334155', lineHeight: '1.6', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                          "{r.nhan_xet}"
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.78125rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '0.65rem' }}>
                          (Khách hàng không để lại bình luận chi tiết)
                        </div>
                      )}

                      {/* Sub Criteria rating breakdown chips */}
                      {r.tieu_chi && (
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748b', pt: '0.25rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            Phục vụ: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.phuc_vu || r.diem_tong_quan || 5}</strong>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            Vệ sinh: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.ve_sinh || r.diem_tong_quan || 5}</strong>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            Tốc độ: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.toc_do || r.diem_tong_quan || 5}</strong>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            Món ăn: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.chat_luong_mon || r.diem_tong_quan || 5}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
