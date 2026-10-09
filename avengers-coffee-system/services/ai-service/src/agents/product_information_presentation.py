"""Extractive product answers. Formatting never adds product facts."""
import re
from src.agents.agent_memory import safe_text


def literal(value, maximum=3000):
    text = safe_text(value, maximum)
    text = re.sub(r'<[^>]*>', '', text)
    text = re.sub(r'([\\`*_{}<>#!|])', r'\\\1', text)
    # Keep ordinary source labels readable in the widget's minimal bold-only
    # renderer, while preventing review text from constructing Markdown links.
    return re.sub(r'\[([^\]\n]*)\](?=\()', r'\\[\1\\]', text)


def description_reply(result, product=None, facet='description'):
    from src.function_calling.tools.knowledge_tools import safe_knowledge_results
    documents = safe_knowledge_results(result.get('results') or [])
    contents = list(dict.fromkeys(knowledge_content(d['content']) if not product and facet == 'description' else literal(d['content']) for d in documents))
    if not contents:
        return result.get('message') or 'Tài liệu hiện có chưa đủ để trả lời câu hỏi này.'
    # Highlight only words present in the approved evidence. This is typography,
    # not an inferred flavor profile or an ingredient/allergen guarantee.
    if facet == 'description':
        contents = [highlight_description(text, escaped=True) for text in contents]
    title = ('**' + literal(product['product_name'], 200) + '**\n\n') if product else ''
    return ('Dạ, thông tin bạn cần như sau:\n\n' if not product else 'Dạ, mình gửi bạn mô tả của món:\n\n') + title + '\n\n'.join(contents)


def reviews_reply(result):
    from src.rag.untrusted_data import safe_review_result
    result = safe_review_result(result)
    total = result.get('total_reviews')
    if not total:
        return '**' + literal(result.get('product_name') or 'Món này', 200) + '** hiện chưa có đánh giá trên hệ thống. Bạn muốn tham khảo mô tả của món không ạ?'
    name = literal(result.get('product_name') or 'Món này', 200)
    lines = [f"**{name}** — **{result['avg_rating']}/5 sao** từ **{total} lượt đánh giá**."]
    distribution = result.get('rating_distribution') or {}
    if distribution:
        lines.append('**Phân bố số sao:** ' + ' · '.join(f'{star}★: {distribution.get(str(star), 0)}' for star in range(5, 0, -1)))
    reviews = result.get('reviews') or [{'comment': c} for c in result.get('recent_comments') or []]
    reviews = [r for r in reviews if isinstance(r, dict) and r.get('comment')][:5]
    if reviews:
        lines.append(f'**{len(reviews)} nhận xét có nội dung gần nhất:**')
        for index, review in enumerate(reviews, 1):
            metadata = []
            if review.get('rating') is not None:
                metadata.append(f"**{review['rating']}/5 sao**")
            if review.get('created_at'):
                metadata.append(literal(str(review['created_at'])[:10], 10))
            label = ' — '.join(metadata)
            lines.append(f'{index}. ' + (label + '\n' if label else '') + '“' + literal(review_text(review['comment']), 1200) + '”')
        lines.append('Bạn muốn xem thêm thông tin về món này không ạ?')
    else:
        lines.append('Hiện chưa có bình luận chi tiết phù hợp để hiển thị; số sao ở trên vẫn tính từ các lượt đánh giá.')
    return '\n\n'.join(lines)


def highlight_description(text, escaped=False):
    text = text if escaped else literal(text)
    sensory = r'\b(?:ngọt nhẹ|ít ngọt|ngọt ngậy|đắng nhẹ|dịu nhẹ|béo ngậy|béo mịn|thơm lừng|thơm ngon|thanh mát|vị trà xanh|nhân matcha|đậm đà)\b'
    return re.sub(sensory, lambda m: '**' + m[0] + '**', text, flags=re.I)


def review_text(value):
    # Presentation-only cleanup explicitly requested for this seeded demo.
    # Evidence/DB comments are preserved; other bracketed content is literal.
    return re.sub(r'^\s*\[\s*dữ liệu mẫu\s*\]\s*', '', str(value or ''), flags=re.I)


def knowledge_content(value):
    lines = []
    for line in str(value).splitlines():
        text = literal(line)
        if line.endswith(':') and len(line) < 100:
            text = '**' + text + '**'
        text = re.sub(r'\b(?:24 giờ(?: làm việc)?|trong ngày|1900 1755)\b', lambda m: '**' + m[0] + '**', text)
        lines.append(text)
    return '\n'.join(lines)


def excerpt(value, maximum):
    source_limit = maximum
    text = literal(value, source_limit)
    while len(text) > maximum - 1:
        source_limit = max(1, source_limit // 2)
        text = literal(value, source_limit)
    return text + ('…' if len(str(value)) > source_limit else '')


def collection_reviews_reply(result, detailed=False):
    from src.rag.untrusted_data import safe_review_result
    rows = safe_review_result(result).get('reviewed_products') or []
    if not rows:
        return result.get('message') or 'Dạ, mình chưa đọc được đánh giá của các món bạn chọn.'
    lines = [f'Dạ, mình gửi bạn '+('đánh giá chi tiết' if detailed else 'tổng quan đánh giá')+f' của **{len(rows)} món** vừa chọn:']
    # Fit every product within the orchestrator's 8,000-character block budget.
    # Short excerpts avoid silently losing the final products in a large list.
    comment_count = 5 if detailed and len(rows) <= 5 else 2
    comment_max = max(40, min(600, (6200 // len(rows) - 280) // comment_count - 50))
    for index, row in enumerate(rows, 1):
        name = excerpt(row['product_name'], 120)
        count, rating = row.get('total_reviews', 0), row.get('avg_rating')
        lines.append(f'{index}. **{name}**' + (f" — **{rating:.2f}/5 sao** · **{count} lượt đánh giá**" if count and rating is not None else ' — chưa có đánh giá.'))
        distribution = row.get('rating_distribution') or {}
        if detailed and distribution:
            lines.append('**Phân bố số sao:** ' + ' · '.join(f'{star}★: {distribution.get(str(star), 0)}' for star in range(5, 0, -1)))
        comments = [r for r in row.get('reviews') or [] if r.get('comment')][:comment_count]
        for comment in comments:
            date = (' — ' + literal(str(comment['created_at'])[:10], 10)) if detailed and comment.get('created_at') else ''
            lines.append(f"- **{comment['rating']}/5 sao**{date}: “{excerpt(review_text(comment['comment']), comment_max)}”")
        if count and not comments:
            lines.append('Chưa có nhận xét bằng chữ để hiển thị.')
    lines.append('Bạn muốn xem thêm nhận xét của món nào? Bạn chọn tên hoặc số món nhé.')
    return '\n\n'.join(lines)
