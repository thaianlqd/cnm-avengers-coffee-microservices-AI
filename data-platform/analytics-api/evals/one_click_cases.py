"""Authored qualification cases, never imported by production planning."""
from copy import deepcopy


def req(id, metrics, dimensions=(), kind='aggregate', *, rank=None, cadence=None, domain=None):
    r = dict(id=id, metric_ids=list(metrics), dimension_ids=list(dimensions), analysis_kind=kind)
    if rank:
        r['ranking'] = dict(limit=rank, metric_id=metrics[0])
    if cadence:
        r['granularity'] = cadence
    if domain:
        r['domain_id'] = domain
    return r


CASES = [
    dict(id='kiosks', question='Trong 30 ngày gần nhất, đánh giá toàn bộ kiosk nhượng quyền và kiosk vệ tinh, loại trừ chi nhánh chính. '
        'Hiển thị tổng doanh thu chi nhánh, số đơn và giá trị đơn trung bình. '
        'Trình bày 5 góc nhìn: Top 10 kiosk theo doanh thu chi nhánh; Top 10 kiosk theo số đơn; '
        'doanh thu chi nhánh theo tuần; doanh thu chi nhánh theo thành phố; doanh thu chi nhánh theo loại điểm bán. '
        'Nêu rõ trạng thái đơn được tính, tổng toàn phạm vi và tổng Top 10.',
        requirements=[req('totals',['store_revenue','order_count','aov']),
            req('revenue_rank',['store_revenue'],['store'],'ranking',rank=10),
            req('count_rank',['order_count'],['store'],'ranking',rank=10),
            req('revenue_week',['store_revenue'],kind='trend',cadence='week'),
            req('revenue_city',['store_revenue'],['city']),
            req('revenue_type',['store_revenue'],['store_type'])]),
    dict(id='products', question='Trong 30 ngày gần nhất, phân tích danh mục sản phẩm toàn hệ thống. '
        'Hiển thị tổng số lượng sản phẩm bán và doanh thu sản phẩm. '
        'Top 10 sản phẩm theo số lượng sản phẩm bán, kèm doanh thu sản phẩm; '
        'Top 10 sản phẩm theo doanh thu sản phẩm, kèm số lượng sản phẩm bán; '
        'số lượng sản phẩm bán theo danh mục; doanh thu sản phẩm theo danh mục; doanh thu sản phẩm theo tuần. '
        'Nêu rõ trạng thái đơn được tính và phân biệt tổng Top 10 với toàn bộ sản phẩm.',
        requirements=[req('totals',['quantity_sold','product_revenue']),
            req('quantity_rank',['quantity_sold','product_revenue'],['product'],'ranking',rank=10),
            req('revenue_rank',['product_revenue','quantity_sold'],['product'],'ranking',rank=10),
            req('category',['quantity_sold','product_revenue'],['category']),
            req('revenue_week',['product_revenue'],kind='trend',cadence='week')]),
    dict(id='payments', question='Trong 30 ngày gần nhất, phân tích giao dịch thanh toán toàn hệ thống. '
        'Hiển thị tổng số giao dịch và tổng số tiền giao dịch. '
        'Số giao dịch theo cổng thanh toán; tổng số tiền giao dịch theo cổng thanh toán; '
        'số giao dịch theo trạng thái giao dịch; số giao dịch theo ngày; tổng số tiền giao dịch theo ngày. '
        'Bổ sung tổng doanh thu đơn hàng để tham khảo. Nêu rõ trạng thái và ngày ghi nhận từng nguồn; '
        'không kết luận chênh lệch giữa giao dịch và đơn hàng là thất thoát.',
        requirements=[req('totals',['payment_count','payment_revenue']),
            req('gateway',['payment_count','payment_revenue'],['payment_gateway']),
            req('status',['payment_count'],['payment_transaction_status']),
            req('daily',['payment_count','payment_revenue'],kind='trend',cadence='day'),
            req('orders',['revenue'])]),
    dict(id='vouchers', question='Trong 60 ngày gần nhất, phân tích việc sử dụng voucher toàn hệ thống. '
        'Hiển thị số đơn dùng voucher, doanh thu voucher và tổng giảm giá. '
        'Top 10 voucher theo số đơn dùng voucher; Top 10 voucher theo doanh thu voucher; '
        'doanh thu voucher theo tuần; tổng giảm giá theo tuần; doanh thu voucher theo thành phố. '
        'Hiển thị mã voucher để phân biệt trùng tên, nêu rõ trạng thái đơn dùng cho từng chỉ số. '
        'Không suy ra lợi nhuận hay tác động nhân quả của voucher.',
        requirements=[req('totals',['voucher_order_count','voucher_revenue','discount_amount']),
            req('use_rank',['voucher_order_count'],['promotion'],'ranking',rank=10),
            req('revenue_rank',['voucher_revenue'],['promotion'],'ranking',rank=10),
            req('weekly',['voucher_revenue','discount_amount'],kind='trend',cadence='week'),
            req('city',['voucher_revenue'],['city'])]),
    dict(id='cashier_shifts', question='Trong 30 ngày gần nhất, phân tích vận hành ca làm và đối soát tiền mặt tại toàn hệ thống. '
        'Hiển thị tổng số ca làm, số ca đi muộn, số ca đã đối soát, doanh thu tiền mặt hệ thống và tổng tiền chênh lệch. '
        'Số ca làm theo tên ca; số ca đi muộn theo chi nhánh; số ca làm theo trạng thái chấm công; '
        'tổng tiền chênh lệch theo chi nhánh; tổng tiền chênh lệch theo tuần. '
        'Giữ nguyên dấu âm và dương của chênh lệch tiền mặt, giải thích ý nghĩa theo định nghĩa dữ liệu. '
        'Công bố ngày ghi nhận của ca làm và đối soát. Không tự quy kết nguyên nhân hoặc trách nhiệm nhân viên.',
        requirements=[req('totals',['shift_count','late_count','reconciled_shifts','system_cash_revenue','total_cash_difference']),
            req('names',['shift_count'],['shift_name']),
            req('late_stores',['late_count'],['store']),
            req('attendance',['shift_count'],['attendance_status']),
            req('differences',['total_cash_difference'],['store']),
            req('weekly',['total_cash_difference'],kind='trend',cadence='week')]),
]


def intent(case):
    return dict(decision='analyze', requirements=deepcopy(case['requirements']))
