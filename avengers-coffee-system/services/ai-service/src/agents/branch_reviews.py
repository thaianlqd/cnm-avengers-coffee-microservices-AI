"""Branch-review scope comes from the newest request and displayed branch IDs."""
import math
import re
from src.rag.documents import normalize_text
from src.agents.agent_memory import safe_text


def review_request(message, branches=None):
    norm = normalize_text(message)
    branch = re.search(r'\b(?:chi nhanh|cua hang|kiosk|diem ban)\b', norm)
    review = re.search(r'\b(?:danh gia|nhan xet|binh luan|so sao|review|rating|tot nhat)\b', norm)
    named = any(re.search(r'\b' + re.escape(normalize_text(row.get('branch_name') or row.get('ten_chi_nhanh') or '')) + r'\b', norm)
                for row in branches or [] if row.get('branch_name') or row.get('ten_chi_nhanh'))
    return bool(review and (branch or named))


def displayed_review_selection(message, branches):
    """Literal read-only followups never expand a displayed list into all stores."""
    if not review_request(message, branches):
        return None
    norm = normalize_text(message)
    if re.search(r'\b(?:them vao gio|mua|dat don|huy don|sua don|chon chi nhanh|thanh toan|thanh phan|di ung|gui danh gia|viet nhan xet|cham diem|khong muon|dung xem|bo qua)\b', norm):
        return None  # Mixed tasks stay with the interpreter and guarded tools.
    indices = re.findall(r'\b(?:chi nhanh|cua hang|kiosk)\s+(?:so|thu)\s+(\d+)\b', norm)
    listed = re.search(r'\b(?:cac|nhung)\s+(?:chi nhanh|cua hang|kiosk)\s+(?:nay|do|vua)', norm) or re.search(r'\b(?:trong so (?:nay|do)|vua liet ke|vua hien thi)\b', norm)
    if not listed and not indices and re.search(r'\b(?:chi nhanh|cua hang|kiosk) (?:nay|do)\b', norm):
        if len(branches or []) != 1:
            return {'message': 'Bạn muốn xem đánh giá của chi nhánh nào trong danh sách? Bạn chọn số thứ tự hoặc gửi tên chi nhánh nhé.'}
        listed = True
    named = [row for row in branches or [] if (row.get('branch_name') or row.get('ten_chi_nhanh')) and
             re.search(r'\b' + re.escape(normalize_text(row.get('branch_name') or row.get('ten_chi_nhanh'))) + r'\b', norm)]
    implicit_comparison = (branches and re.search(r'\b(?:chi nhanh|cua hang|kiosk) nao\b', norm)
        and re.search(r'\bnhat\b', norm) and not re.search(r'\b(?:toan|tat ca|phuong|quan|tinh|thanh pho|o|tai)\b', norm))
    if not listed and not indices and not named and not implicit_comparison:
        return None
    rows = named if named and not listed and not indices else (branches or [])
    if indices:
        wanted = {int(n) for n in indices}
        rows = [row for row in rows if row.get('display_index') in wanted]
        if len(rows) != len(wanted):
            rows = []
    ids = [str(row.get('branch_id') or row.get('ma_chi_nhanh') or '') for row in rows]
    if not ids or any(not identity for identity in ids) or len(set(ids)) != len(ids):
        return {'message': 'Mình chưa xác định được các chi nhánh bạn đang nhắc tới. Bạn xem lại danh sách chi nhánh hoặc gửi tên chi nhánh muốn xem đánh giá nhé.'}
    return {'branch_ids': ids}


def review_reply(result):
    if result.get('status') != 'ok':
        return result.get('message') or 'Mình chưa đọc được đánh giá chi nhánh lúc này. Bạn thử lại nhé.'
    rows = result.get('reviewed_branches') or []
    if not rows:
        return 'Mình chưa có dữ liệu đánh giá của các chi nhánh bạn chọn.'
    lines = ['Dạ, đây là đánh giá **trong các chi nhánh bạn vừa chọn** (chỉ tính đánh giá đã được duyệt trong hệ thống):']
    rated = []
    for n, row in enumerate(rows, 1):
        name = safe_text(row['branch_name'], 200)
        count, rating = row.get('total_reviews', 0), row.get('avg_rating')
        if count and isinstance(rating, (int, float)) and math.isfinite(rating):
            rated.append(row)
            lines.append(f'{n}. **{name}** — **{rating:.2f}/5**, từ **{count} đánh giá**.')
        else:
            lines.append(f'{n}. **{name}** — chưa có đánh giá được duyệt; chưa đủ dữ liệu để xếp hạng.')
        comments = row.get('reviews') or []
        for comment in comments[:3]:
            value = safe_text(comment.get('comment'), 400)
            if value:
                lines.append(f'   Nhận xét gần đây ({comment["rating"]}/5): “{value}”')
        if count and not comments:
            lines.append('   Chưa có nhận xét bằng chữ được duyệt.')
    if rated:
        best = max(row['avg_rating'] for row in rated)
        names = [safe_text(row['branch_name'], 200) for row in rated if row['avg_rating'] == best]
        lines.append(('**Cùng có điểm trung bình cao nhất:** ' if len(names) > 1 else '**Có điểm trung bình cao nhất:** ') + ', '.join(names) + '.')
        lines.append('Bạn cân nhắc thêm số lượt đánh giá và các nhận xét nhé; kết quả này chỉ so sánh những chi nhánh ở trên ạ.')
    else:
        lines.append('Hiện chưa đủ đánh giá để kết luận chi nhánh nào tốt nhất trong danh sách này ạ.')
    return '\n\n'.join(lines)
