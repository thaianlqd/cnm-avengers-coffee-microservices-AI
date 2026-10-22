import { AlertTriangle as WorkspaceSymbolAlertTriangle } from '../../../components/console/WorkspaceIcons'
import { PaginatedList } from '../../../components/console/CompactPagination'
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
} from '../../../components/console/WorkspaceIcons';
import { API_BASE_URL } from '../../admin-dashboard/constants';
import { GlobalLoading } from '../../../components/console/GlobalLoading';

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
            fill={s <= rounded ? '#f59e0b' : '#e2e4df'}
            color={s <= rounded ? '#d97706' : '#ccd3c7'}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="branch-detail-view-container" style={{ padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '14px', minHeight: '100%' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button className="workspace-back-button"
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.45rem 1rem',
            backgroundColor: '#ffffff',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontWeight: '500',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            transition: 'all 0.15s ease'
          }}
        >
          <ArrowLeft size={15} />
          <span>Quay lại danh sách chi nhánh</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button className="workspace-back-button" 
            type="button"
            onClick={fetchReviews}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.78125rem',
              fontWeight: '500',
              color: '#475569',
              cursor: 'pointer'
            }}
            title="Làm mới dữ liệu đánh giá"
          >
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
            <span>Tải lại</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Mã:</span>
            <strong style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e40af', fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace" }}>{branchCode}</strong>
          </div>
        </div>
      </div>

      {/* Branch Hero Overview Banner Card */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
            {/* Branch Image Thumbnail or Avatar Icon */}
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', flexShrink: 0, overflow: 'hidden' }}>
              {branch?.hinh_anh_url ? (
                <img src={branch.hinh_anh_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Store size={24} />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  {String(branch?.ten_chi_nhanh || branch?.name || 'Chi nhánh Avengers Coffee').replace(/[\u2014\u2013]/g, '-')}
                </h1>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 7px',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  backgroundColor: branch?.trang_thai === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                  color: branch?.trang_thai === 'ACTIVE' ? '#166534' : '#991b1b',
                  border: branch?.trang_thai === 'ACTIVE' ? '1px solid #bbf7d0' : '1px solid #fecaca'
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: branch?.trang_thai === 'ACTIVE' ? '#16a34a' : '#dc2626' }}></span>
                  {branch?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm dừng'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8125rem', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <MapPin size={13} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span>{branch?.dia_chi || 'Chưa cập nhật địa chỉ'}</span>
                  {branch?.map_url && (
                    <a href={branch.map_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none', marginLeft: '0.3rem' }}>
                      Maps <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.78125rem', color: '#64748b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Phone size={12} color="#3b82f6" />
                    <span>{branch?.so_dien_thoai || 'Chưa cập nhật SĐT'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={12} color="#f59e0b" />
                    <span>Mở cửa: {branch?.gio_mo_cua || '07:00'} - {branch?.gio_dong_cua || '22:00'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overall Rating Score Card Widget */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem 1.15rem', borderRadius: '10px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', lineHeight: '1' }}>
                {Number(avgRating).toFixed(1)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '500', marginTop: '2px' }}>trên 5.0</div>
            </div>

            <div style={{ height: '2.2rem', width: '1px', backgroundColor: '#e2e8f0' }}></div>

            <div>
              <div style={{ marginBottom: '0.2rem' }}>{renderStars(avgRating, 16)}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Award size={12} color="#f59e0b" />
                <span>{totalReviews} lượt đánh giá thực tế</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <GlobalLoading
          text="Đang tải dữ liệu đánh giá chi nhánh..."
          subtext="Đang tổng hợp các tiêu chí phục vụ và phản hồi khách hàng"
          minHeight="260px"
        />
      ) : error ? (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1.25rem', color: '#dc2626', fontWeight: '500', textAlign: 'center', fontSize: '0.875rem' }}>
          <WorkspaceSymbolAlertTriangle size="1.1em" aria-hidden="true" /> {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* 4 Service Evaluation Criteria Stat Cards */}
          <div>
            <h3 style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Award size={15} color="#3b82f6" /> Thống kê theo 4 Tiêu chí Phục vụ
            </h3>

            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
              {/* Criteria 1: Service Attitude */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Thái độ phục vụ</span>
                  <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '6px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Smile size={14} color="#2563eb" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: '600', color: '#0f172a' }}>{Number(criteria.phuc_vu || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '500' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#3b82f6', height: '100%', width: `${(Number(criteria.phuc_vu || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>

              {/* Criteria 2: Cleanliness & Space */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Không gian &amp; Vệ sinh</span>
                  <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '6px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={14} color="#0891b2" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: '600', color: '#0f172a' }}>{Number(criteria.ve_sinh || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '500' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#0891b2', height: '100%', width: `${(Number(criteria.ve_sinh || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>

              {/* Criteria 3: Service Speed */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Tốc độ lên món</span>
                  <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '6px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={14} color="#d97706" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: '600', color: '#0f172a' }}>{Number(criteria.toc_do || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '500' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f59e0b', height: '100%', width: `${(Number(criteria.toc_do || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>

              {/* Criteria 4: Drink & Food Quality */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Chất lượng đồ uống</span>
                  <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '6px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Coffee size={14} color="#7c3aed" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: '600', color: '#0f172a' }}>{Number(criteria.chat_luong_mon || 5.0).toFixed(1)}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '500' }}>/ 5.0</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#7c3aed', height: '100%', width: `${(Number(criteria.chat_luong_mon || 5.0) / 5) * 100}%`, borderRadius: '9999px' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Star Filter Bar & Reviews List */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem', marginBottom: '1.15rem', paddingBottom: '0.85rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <MessageSquare size={16} color="#3b82f6" />
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                  Danh sách Nhận xét Khách hàng ({filteredItems.length})
                </h3>
              </div>

              {/* COMPACT MODERN SEGMENTED STAR FILTER TABS */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: '#f1f5f9',
                padding: '3px',
                borderRadius: '8px',
                gap: '2px',
                border: '1px solid #e2e8f0',
                flexWrap: 'wrap'
              }}>
                {['ALL', '5', '4', '3', '2', '1'].map((star) => {
                  const isActive = starFilter === star;
                  const count = starCounts[star] || 0;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setStarFilter(star)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '3px 8px',
                        height: '26px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: isActive ? '#ffffff' : 'transparent',
                        color: isActive ? '#0f172a' : '#64748b',
                        fontSize: '0.75rem',
                        fontWeight: isActive ? '600' : '500',
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
                        transition: 'all 0.15s ease',
                        outline: 'none',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {star === 'ALL' ? (
                        <span>Tất cả</span>
                      ) : (
                        <>
                          <span>{star}</span>
                          <Star size={11} fill={isActive ? '#f59e0b' : '#fbbf24'} color={isActive ? '#d97706' : '#d97706'} />
                        </>
                      )}
                      <span style={{
                        fontSize: '0.6875rem',
                        color: isActive ? '#2563eb' : '#94a3b8',
                        fontWeight: isActive ? '600' : '400',
                        marginLeft: '1px'
                      }}>
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Empty State */}
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                <MessageSquareDashed size={36} color="#94a3b8" style={{ marginBottom: '0.5rem', opacity: 0.8 }} />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>Chưa có nhận xét nào phù hợp với bộ lọc</h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78125rem', color: '#64748b' }}>Thử chọn mức sao khác để xem đánh giá tương ứng</p>
              </div>
            ) : (
              /* Review Cards List */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <PaginatedList items={filteredItems} resetKey={JSON.stringify([branchCode,starFilter])}>{(r) => {
                  const customerName = r.ten_nguoi_dung || 'Khách hàng Avengers Coffee';
                  const firstChar = customerName.charAt(0).toUpperCase();

                  return (
                    <div key={r.id || Math.random()} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem 1.15rem', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)', transition: 'all 0.15s ease' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: '600', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #dbeafe', flexShrink: 0 }}>
                            {firstChar}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: '600' }}>{customerName}</strong>
                              <span style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.6875rem', fontWeight: '500', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <CheckCircle2 size={9} /> Đã mua hàng
                              </span>
                              {r.ma_don_hang && (
                                <span style={{ fontSize: '0.7rem', color: '#475569', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '1px 5px', borderRadius: '4px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace" }}>
                                  <ShoppingBag size={10} color="#64748b" /> #{r.ma_don_hang}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px', display: 'block' }}>
                              {r.ngay_tao ? new Date(r.ngay_tao).toLocaleString('vi-VN') : 'Mới đây'}
                            </span>
                          </div>
                        </div>

                        {/* Overall Rating Pill */}
                        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.2rem 0.55rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {renderStars(r.diem_tong_quan || 5, 12)}
                          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#0f172a' }}>
                            {Number(r.diem_tong_quan || 5).toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Comment text */}
                      {r.nhan_xet ? (
                        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderLeft: '3px solid #3b82f6', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.8125rem', color: '#334155', lineHeight: '1.5', marginBottom: '0.65rem' }}>
                          "{r.nhan_xet}"
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                          (Khách hàng không để lại bình luận chi tiết)
                        </div>
                      )}

                      {/* Sub Criteria rating breakdown chips */}
                      {r.tieu_chi && (
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#64748b', paddingTop: '0.15rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            Phục vụ: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.phuc_vu || r.diem_tong_quan || 5}</strong>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            Vệ sinh: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.ve_sinh || r.diem_tong_quan || 5}</strong>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            Tốc độ: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.toc_do || r.diem_tong_quan || 5}</strong>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            Món ăn: <strong style={{ color: '#0f172a' }}>⭐{r.tieu_chi.chat_luong_mon || r.diem_tong_quan || 5}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}</PaginatedList>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
