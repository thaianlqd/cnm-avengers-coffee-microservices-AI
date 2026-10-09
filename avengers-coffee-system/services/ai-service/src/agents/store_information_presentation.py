"""Read-only information, without implicit checkout milestones or selection."""
from src.agents.product_information_presentation import literal, review_text
from src.rag.untrusted_data import safe_review_result


def payment_methods_reply(result):
    options = result.get('payment_options') or []
    if not options:
        return 'Mình chưa đọc được các phương thức thanh toán lúc này.'
    lines = ['Dạ, quán hỗ trợ các phương thức thanh toán sau:']
    for row in options:
        lines.append('- **' + literal(row.get('label') or row['code'], 100) + '**')
    lines.append('Bạn chọn phương thức khi đặt hàng. **Ví Avengers** cần đăng nhập và đủ số dư để thanh toán đơn.')
    return '\n\n'.join(lines)


def store_reply(result, facet):
    result = safe_review_result(result)
    if facet == 'reviews':
        if 'stores' in result:
            rows = result['stores']
            if not rows:
                return result.get('message') or 'Chưa có cửa hàng có đánh giá phù hợp để hiển thị.'
            lines = ['Dạ, đây là các cửa hàng có **điểm đánh giá cao** (chỉ tính đánh giá đã được duyệt):']
            for index, row in enumerate(rows[:5], 1):
                lines.append(f"{index}. **{literal(row['ten_chi_nhanh'], 200)}** — **{row['avg_rating']:.2f}/5 sao**, "
                             f"từ **{row['total_reviews']} lượt đánh giá**.\n{literal(row.get('dia_chi') or '', 500)}")
            lines.append('Bạn muốn đọc nhận xét chi tiết của cửa hàng nào? Bạn gửi tên hoặc số trong danh sách nhé.')
            return '\n\n'.join(lines)
        from src.agents.branch_reviews import review_reply
        if result.get('reviewed_branches') is not None:
            return review_reply(result)
        lines = ['**' + literal(result.get('branch_name') or 'Cửa hàng', 200) + '** — nhận xét gần nhất:']
        for index, review in enumerate(result.get('reviews') or [], 1):
            lines.append(f"{index}. **{review['rating']}/5 sao** — {literal(str(review.get('date') or '')[:10], 10)}\n"
                         '“' + literal(review_text(review['comment']), 1200) + '”')
        return '\n\n'.join(lines) if result.get('reviews') else ('Dạ, **' + literal(result.get('branch_name') or 'cửa hàng này', 200) + '** hiện chưa có nhận xét bằng chữ để bạn tham khảo. Bạn muốn xem địa chỉ, giờ mở cửa hoặc đánh giá của cửa hàng khác không ạ?')
    branches = result.get('branches') or []
    if not branches:
        return result.get('message')
    lines = ['Dạ, giờ mở cửa được công bố **theo từng chi nhánh**:' if facet == 'hours' else 'Dạ, mình gửi bạn các cửa hàng' + (' tại **' + literal(result['area'], 200) + '**' if result.get('area') else '') + ':']
    for index, row in enumerate(branches[:5], 1):
        lines.append(f"{index}. **{literal((row.get('branch_name') or row.get('ten_chi_nhanh') or 'Cửa hàng'), 200)}**\n{literal(row.get('address') or row.get('dia_chi') or '', 500)}")
        if facet == 'hours':
            opening, closing = row.get('opening_time'), row.get('closing_time')
            parts = ([f"Mở cửa: **{literal(str(opening), 30)}**"] if opening else []) + ([f"Đóng cửa: **{literal(str(closing), 30)}**"] if closing else [])
            lines.append(' · '.join(parts) if parts else 'Chi nhánh này chưa có giờ mở/đóng cửa được công bố trong hệ thống.')
    if not result.get('exact_branch'):
        lines.append('Bạn muốn xem cửa hàng nào? Bạn gửi tên, khu vực hoặc số trong danh sách nhé.')
    return '\n\n'.join(lines)
