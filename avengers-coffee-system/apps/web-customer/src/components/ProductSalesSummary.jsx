export default function ProductSalesSummary({ product, detailed = false, className = '' }) {
  if (product?.sold_count == null || product?.order_count == null) return null;
  const sold = Number(product.sold_count);
  const orders = Number(product.order_count);
  if (!Number.isFinite(sold) || !Number.isFinite(orders) || sold < 0 || orders < 0) return null;
  const basis = 'Tính từ các đơn đã hoàn thành và thanh toán trong tháng này.';

  return (
    <div className={`text-xs leading-relaxed text-gray-500 ${className}`} title={basis}>
      <p>
        Đã bán <strong className="font-semibold text-gray-700">{sold.toLocaleString('vi-VN')}</strong>
        {' · '}<strong className="font-semibold text-gray-700">{orders.toLocaleString('vi-VN')}</strong> đơn tháng này
      </p>
      {detailed && <p className="mt-1 text-xs">{basis}</p>}
    </div>
  );
}
