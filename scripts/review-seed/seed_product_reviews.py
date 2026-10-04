#!/usr/bin/env python3
"""Replace explicitly recognized demo comments; never synthesize live reviews.

No AI/API clients are used. Preparing is read-only; applying requires its saved
plan and backup. Only binh_luan changes; row identities, stars and orders stay.
"""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

VERSION = 'product-reviews-v1'
PREFIX = '[Dữ liệu mẫu] '
LEGACY_COMMENTS = frozenset([
    'Đồ uống ngon nhưng hơi nhiều đá một chút.',
    'Giao nhanh, đá vẫn còn nguyên, ly trà vải thanh mát dễ chịu.',
    'Cà phê phin sữa đá chuẩn vị truyền thống, đậm đặc đúng chuẩn!',
    'Trà đào cam sả thanh mát, miếng đào to giòn sần sật.',
    'Freeze trà xanh siêu đỉnh, thạch giòn sần sật ăn cuốn dã man.',
    'Cà phê ngon, đóng gói đẹp, shipper nhiệt tình.',
    'Vị chuẩn nhưng lần sau mình sẽ chọn 50% đường cho đỡ ngọt.',
    'Freeze chocolate thơm béo, kem tươi ngậy vừa miệng.',
    'Freeze ngon, kem béo nhưng tan hơi nhanh do trời nắng.',
    'Bánh mì que giòn rụm, pate béo ngậy ăn kèm cà phê sáng rất ngon.',
    'Cà phê thơm đậm đà, vị đắng thanh rất hợp gu!',
    'Uống Americano buổi sáng tỉnh táo hẳn, đóng gói cẩn thận.',
    'Bạc xỉu 3 tầng đẹp mắt, vị ngọt béo vừa phải không bị gắt.',
    'Trà sen vàng thơm, hạt sen bùi bùi nhưng hơi ít thạch củ năng.',
    'Specialty Coffee rất chất lượng, hương vị tinh tế vượt mong đợi.',
    'Vị cà phê hơi nhạt so với các lần trước uống tại quán.',
    'Đồ uống tạm ổn, cảm giác ngọt hơn so với bình thường.',
    'Hôm nay giao hơi chậm một chút, đá tan bớt.',
    'Hơi nhiều đường so với ghi chú ít đường của mình.',
    'Bị nhầm size L thành size M, mong quán kiểm tra kỹ đơn.',
    'Giao hàng bị đổ một chút ra ngoài nắp ly, mong quán đóng màng bọc kỹ hơn.',
    'Seeded review for analytics test',
])

PRODUCT_QUERY = '''SELECT p.ma_san_pham AS id, p.ten_san_pham AS name,
    p.mo_ta AS description, d.ten_danh_muc AS category, p.trang_thai AS active,
    p.sizes, p.luong_da, p.do_ngot, p.loai_sua, p.toppings
    FROM menu.san_pham p LEFT JOIN menu.danh_muc d ON d.ma_danh_muc=p.ma_danh_muc
    ORDER BY p.ma_san_pham'''
DETAIL_QUERY = '''SELECT r.id AS review_id, ct.id AS line_id, ct.kich_co AS size,
    ct.toppings, ct.luong_da, ct.do_ngot, ct.loai_sua
    FROM orders.danh_gia_san_pham r JOIN orders.chi_tiet_don_hang ct
    ON ct.ma_don_hang=r.ma_don_hang AND ct.ma_san_pham::text=r.ma_san_pham
    ORDER BY r.id,ct.id'''


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        default=str, separators=(',', ':')).encode()).hexdigest()


def load_profiles(path=None):
    path = Path(path or Path(__file__).with_name('product_profiles.tsv'))
    profiles = {}
    with path.open(encoding='utf-8') as f:
        for row in csv.DictReader(f, delimiter='|'):
            pid = int(row['id'])
            if pid in profiles:
                raise ValueError('Duplicate product profile')
            profiles[pid] = {**row, 'notes': row['notes'].split(';'),
                             'concerns': row['concerns'].split(';')}
    return profiles


def validate_catalog(products, profiles):
    for product in products:
        profile = profiles.get(int(product['id']))
        if not profile or product['name'].strip() != profile['name']:
            raise ValueError('Menu changed: missing/mismatched profile for product ' + str(product['id']))
        if len(profile['notes']) < 3 or len(profile['concerns']) < 2:
            raise ValueError('Insufficient product-specific content')


def option_labels(value):
    if isinstance(value, dict):
        return list(value)
    if isinstance(value, list):
        return [r if isinstance(r, str) else r.get('name') or r.get('label') or r.get('ten')
                for r in value if isinstance(r, (str, dict))]
    return []


def matching_option(value, offered):
    labels = option_labels(offered)
    # Old seed lines store display prices inside the topping label. Remove
    # that suffix only; never rename an unknown topping to a different recipe.
    value = re.sub(r'\s*\(\+\s*\d+(?:[.,]\d+)?\s*(?:k|đ|d|vnd)\)\s*$', '',
                   str(value or ''), flags=re.IGNORECASE).strip()
    return next((label for label in labels if label and str(label).casefold() == value.casefold()), None)


def valid_order_context(product, profile, details):
    # Conflicting configurations in one order cannot be attributed to a review.
    if len(details) != 1 or profile['kind'] not in {'hot', 'cold', 'frappe'}:
        return []
    detail, fragments = details[0], []
    size = {'S': 'Nhỏ', 'M': 'Vừa', 'L': 'Lớn'}.get(detail.get('size'), detail.get('size'))
    size = matching_option(size, product.get('sizes'))
    if size:
        fragments.append('Mình chọn size ' + size + '.')
    toppings = []
    for name in option_labels(detail.get('toppings')):
        match = matching_option(name, product.get('toppings'))
        if match and match not in toppings:
            toppings.append(match)
    if toppings:
        fragments.append('Phần thêm của mình có ' + ', '.join(toppings) + '.')
    for key, label in [('do_ngot', 'Độ ngọt'), ('loai_sua', 'Loại sữa')]:
        value = matching_option(detail.get(key), product.get(key))
        if value:
            fragments.append(label + ' mình chọn là ' + value + '.')
    # Never translate old percentages to current Menu options by guessing.
    if profile['kind'] != 'hot':
        ice = matching_option(detail.get('luong_da'), product.get('luong_da'))
        if ice:
            fragments.append('Lượng đá mình chọn là ' + ice + '.')
    return fragments


OPENERS = [
    '{name}: {body}', 'Mình chọn {name}. {body}',
    'Với {name}, mình thấy {body_lower}', '{name} lần này: {body}',
    'Cảm nhận của mình về {name}: {body}', 'Thử {name} rồi, mình thấy {body_lower}',
    'Đánh giá riêng {name}: {body}', 'Phần {name} mình nhận: {body}',
    'Mình vừa thử {name}: {body}', 'Nói về {name}: {body}',
    '{name} theo khẩu vị của mình: {body}', 'Mình đánh giá {name} như sau: {body}',
]
POSITIVE_ENDINGS = [
    'Rất hợp gu mình.', 'Mình thích sự kết hợp này.',
    'Trải nghiệm tốt hơn mình mong đợi.', 'Mình sẽ chọn lại món này.',
    'Điểm này làm mình thích nhất.', 'Đúng kiểu mình đang tìm.',
    'Ấn tượng riêng của món này khá rõ.', 'Mình hài lòng với lựa chọn này.',
]


def generate_comment(product, profile, stars, sequence, contexts=()):
    if stars not in {1, 2, 3, 4, 5}:
        raise ValueError('Rating out of range')
    # Mixed radix creates varied, repeatable phrasing without random ratings.
    note = profile['notes'][sequence % len(profile['notes'])]
    openers = [value for value in OPENERS if 'khẩu vị' not in value] if profile['kind'] == 'merch' else OPENERS
    opener = openers[(sequence // 3) % len(openers)]
    concern = profile['concerns'][(sequence // 36) % len(profile['concerns'])]
    ending = POSITIVE_ENDINGS[(sequence // 72) % len(POSITIVE_ENDINGS)]
    if profile['kind'] == 'merch':
        ending = ending.replace('món này', 'sản phẩm này')
    capitalized_note = note[:1].upper() + note[1:]
    if stars == 5:
        body = capitalized_note + '. ' + ending
    elif stars == 4:
        body = capitalized_note + '. Nhìn chung ổn, nhưng ' + concern + '.'
    elif stars == 3:
        body = capitalized_note + ' là điểm mình thích, tuy nhiên ' + concern + '. Với mình chỉ ở mức tạm ổn.'
    elif stars == 2:
        body = 'Mình chưa hài lòng vì ' + concern + '. Trải nghiệm chưa hợp với mình.'
    else:
        body = 'Mình thất vọng vì ' + concern + '. Lần này chưa đạt điều mình mong đợi.'
    # Low-rating bodies have no positive note: still vary using their own styles.
    if stars <= 2:
        concern = profile['concerns'][sequence % len(profile['concerns'])]
        issues = ['Chưa hợp gu mình vì ', 'Điểm mình chưa thích là ',
                  'Lần này mình không hài lòng vì ']
        body = issues[(sequence // 2) % len(issues)] + concern + '. ' + (
            'Mình chỉ đánh giá 2 sao cho trải nghiệm này.' if stars == 2
            else 'Lần này mình chỉ đánh giá 1 sao, mong món được cải thiện.')
    text = opener.format(name=product['name'], body=body,
                         body_lower=body[:1].lower() + body[1:])
    if contexts:
        text += ' ' + contexts[(sequence // 12) % len(contexts)]
    return PREFIX + text


def build_changes(products, reviews, details, profiles):
    validate_catalog(products, profiles)
    product_map = {str(p['id']): p for p in products}
    by_review = defaultdict(list)
    for row in details:
        by_review[row['review_id']].append(row)
    counters, used, changes = Counter(), set(), []
    for review in sorted(reviews, key=lambda row: row['id']):
        if review.get('binh_luan') not in LEGACY_COMMENTS:
            continue
        product = product_map.get(str(review['ma_san_pham']))
        if not product:
            raise ValueError('Legacy review has unknown product')
        profile = profiles[int(product['id'])]
        stars = int(review['so_sao'])
        context = valid_order_context(product, profile, by_review[review['id']])
        key = (product['name'], stars)
        seq = counters[key]
        for _ in range(1000):
            after = generate_comment(product, profile, stars, seq, context)
            seq += 1
            if after not in used:
                break
        else:
            raise ValueError('Not enough unique product-specific variants')
        counters[key] = seq
        used.add(after)
        changes.append(dict(id=review['id'], product_id=str(product['id']),
            product_name=product['name'], stars=stars, before=review['binh_luan'], after=after))
    return changes


def engine_from_environment():
    from sqlalchemy import create_engine
    from sqlalchemy.engine import URL
    if os.getenv('DATABASE_URL'):
        url = os.environ['DATABASE_URL']
    else:
        required = ('DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME')
        if any(not os.getenv(key) for key in required):
            raise ValueError('Missing database configuration')
        url = URL.create('postgresql+psycopg2', username=os.environ['DB_USER'],
            password=os.environ['DB_PASSWORD'], host=os.environ['DB_HOST'],
            port=int(os.environ['DB_PORT']), database=os.environ['DB_NAME'],
            query={'sslmode': 'require'})
    return create_engine(url, connect_args={'connect_timeout': 15})


def write_private(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, default=str)
        f.flush()
        os.fsync(f.fileno())


def prepare(engine, folder):
    from sqlalchemy import text
    folder = Path(folder)
    profiles = load_profiles()
    with engine.connect() as conn:
        conn.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
        conn.execute(text("SET LOCAL statement_timeout='30s'"))
        products = [dict(r) for r in conn.execute(text(PRODUCT_QUERY)).mappings()]
        reviews = [dict(r) for r in conn.execute(text('SELECT * FROM orders.danh_gia_san_pham ORDER BY id')).mappings()]
        details = [dict(r) for r in conn.execute(text(DETAIL_QUERY)).mappings()]
    changes = build_changes(products, reviews, details, profiles)
    backup = dict(version=VERSION, timestamp=datetime.now(timezone.utc).isoformat(),
                  products=products, reviews=reviews, order_details=details)
    write_private(folder/'backup.json', backup)
    plan = dict(version=VERSION, backup_hash=digest(backup), catalog_hash=digest(products),
                profiles_hash=digest(profiles), changes=changes,
                preserved_review_ids=[r['id'] for r in reviews if r['id'] not in {c['id'] for c in changes}])
    write_private(folder/'plan.json', plan)
    render_preview(products, changes, folder/'preview.md')
    print(json.dumps(dict(products=len(products), total_reviews=len(reviews),
        replacing=len(changes), preserving=len(reviews)-len(changes), unique_comments=len({r['after'] for r in changes}),
        plan=str(folder/'plan.json')), ensure_ascii=False))


def render_preview(products, changes, path):
    lines = ['# Đánh giá sản phẩm mẫu — bản xem trước', '',
        'Dữ liệu mô phỏng cho demo. Chỉ thay bình luận thuộc danh sách seed cũ; giữ sao, tác giả, mã đơn và thời gian.', '']
    for product in products:
        rows = [row for row in changes if row['product_id'] == str(product['id'])]
        lines += ['## ' + product['name'] + ' (ID ' + str(product['id']) + ')', '',
                  f"{len(rows)} bình luận; loại: {product['category']}.", '']
        for stars in (5, 4, 3, 2, 1):
            row = next((r for r in rows if r['stars'] == stars), None)
            if row:
                lines += [f"- **{stars} sao**: {row['after']}"]
        lines += ['']
    Path(path).write_text('\n'.join(lines), encoding='utf-8')


def apply_plan(engine, folder, restore=False):
    from sqlalchemy import text
    folder = Path(folder)
    plan = json.loads((folder/'plan.json').read_text(encoding='utf-8'))
    backup = json.loads((folder/'backup.json').read_text(encoding='utf-8'))
    if plan['version'] != VERSION or plan['backup_hash'] != digest(backup):
        raise ValueError('Missing or changed backup/plan')
    if not restore and plan['profiles_hash'] != digest(load_profiles()):
        raise ValueError('Profiles changed after preparation')
    if not restore and build_changes(backup['products'], backup['reviews'],
            backup['order_details'], load_profiles()) != plan['changes']:
        raise ValueError('Plan no longer matches its backed-up Menu and order data')
    snapshot = {row['id']: row for row in backup['reviews']}
    changes = plan['changes']
    if len({row['id'] for row in changes}) != len(changes):
        raise ValueError('Duplicate review IDs in plan')
    for row in changes:
        old = snapshot.get(row['id'])
        if (not old or row['before'] != old['binh_luan'] or row['before'] not in LEGACY_COMMENTS
                or row['product_id'] != str(old['ma_san_pham']) or row['stars'] != old['so_sao']
                or not row['after'].startswith(PREFIX)):
            raise ValueError('Invalid seed replacement')
    params = [dict(id=r['id'], product_id=r['product_id'], stars=r['stars'],
        expected=r['after'] if restore else r['before'], replacement=r['before'] if restore else r['after']) for r in changes]
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL statement_timeout='30s'"))
        conn.execute(text("SET LOCAL lock_timeout='5s'"))
        # Concurrent user reviews may not be overwritten or partially replaced.
        conn.execute(text('LOCK TABLE orders.danh_gia_san_pham IN SHARE ROW EXCLUSIVE MODE'))
        if not restore:
            current = [dict(r) for r in conn.execute(text(PRODUCT_QUERY)).mappings()]
            if digest(current) != plan['catalog_hash']:
                raise ValueError('Menu changed after preparation; prepare a new plan')
        if params:
            updated = conn.execute(text('''WITH replacements AS (
                SELECT * FROM jsonb_to_recordset(CAST(:rows AS jsonb))
                AS x(id integer,product_id text,stars integer,expected text,replacement text))
                UPDATE orders.danh_gia_san_pham r SET binh_luan=x.replacement FROM replacements x
                WHERE r.id=x.id AND r.ma_san_pham=x.product_id AND r.so_sao=x.stars
                AND r.binh_luan IS NOT DISTINCT FROM x.expected RETURNING r.id'''),
                {'rows': json.dumps(params, ensure_ascii=False)}).fetchall()
            if len(updated) != len(params):
                raise ValueError('Review changed after preparation; entire transaction rolled back')
        else:
            updated = []
    print(json.dumps(dict(status='restored' if restore else 'applied', comments=len(updated),
                          stars_changed=0, orders_changed=0, version=VERSION), ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'apply', 'restore'])
    parser.add_argument('--folder', required=True, help='Private backup/plan folder (copy outside Docker before applying)')
    args = parser.parse_args()
    engine = engine_from_environment()
    if args.mode == 'prepare':
        prepare(engine, args.folder)
    else:
        apply_plan(engine, args.folder, restore=args.mode == 'restore')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Connection failures must not print DSNs, credentials or private rows.
        print('Review seed failed: ' + type(exc).__name__, file=sys.stderr)
        sys.exit(1)
