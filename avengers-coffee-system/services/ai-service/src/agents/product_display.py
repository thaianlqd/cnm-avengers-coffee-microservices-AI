"""Shared Menu classification and numbering for cards and selection evidence."""
PRODUCT_GROUP_LABELS = {
    'food': 'Bánh & đồ ăn', 'drink': 'Đồ uống',
    'topping': 'Topping', 'unknown': 'Các món khác',
}
PRODUCT_REFERENCE_LABELS = {'food': 'bánh', 'drink': 'nước'}


def product_bucket(row):
    bucket = row.get('menu_bucket')
    if bucket in PRODUCT_GROUP_LABELS:
        return bucket
    # Recommendations return leaf + root labels; older Redis snapshots only
    # kept the leaf. Reuse the existing Menu mapping, never the product name
    # (a coffee-flavoured cake must stay food).
    from src.agents.order_flow_graph import _map_db_category_to_bucket, _norm
    if _norm(row.get('category')) == 'topping':
        return 'topping'
    return _map_db_category_to_bucket(row.get('category'), row.get('parent_category'))


def numbered_products(rows, grouped=False):
    counts, result = {}, []
    for index, row in enumerate(rows, 1):
        bucket = product_bucket(row)
        counts[bucket] = counts.get(bucket, 0) + 1
        result.append({**row, 'menu_bucket': bucket, 'display_index': counts[bucket] if grouped else index,
                       'global_display_index': index,
                       'group_display_index': counts[bucket]})
    return result
