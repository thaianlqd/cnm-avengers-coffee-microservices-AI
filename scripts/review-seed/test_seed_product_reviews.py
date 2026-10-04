"""Offline content/scope/atomicity checks; no database connection or key."""
from copy import deepcopy
from pathlib import Path
import json
import socket

import pytest
import seed_product_reviews as seed


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('No network allowed in review seed tests')
    monkeypatch.setattr(socket.socket, 'connect', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setattr(socket, 'getaddrinfo', forbidden)


@pytest.fixture
def dataset():
    profiles = seed.load_profiles()
    products, reviews = [], []
    for pid, profile in profiles.items():
        products.append(dict(id=pid, name=profile['name'], description='Menu fixture', category=profile['kind'],
            sizes={'Vừa': 39000}, toppings={'Hạt Sen': 10000}, do_ngot={'Ít ngọt': 0},
            luong_da=None if profile['kind'] == 'hot' else {'Ít đá': 0}, loai_sua=None))
        for i in range(30):
            reviews.append(dict(id=len(reviews)+1, ma_san_pham=str(pid), so_sao=[5,5,5,4,3,2,1][i % 7],
                binh_luan='Freeze chocolate thơm béo, kem tươi ngậy vừa miệng.',
                ma_nguoi_dung='fixture-user', ma_don_hang='fixture-order', ngay_tao='2026-01-01'))
    reviews.append(dict(id=99999, ma_san_pham='35', so_sao=5, binh_luan='ngon'))
    return products, reviews, profiles


def test_every_product_is_covered_diversely_and_genuine_text_is_untouched(dataset):
    products, reviews, profiles = dataset
    original = deepcopy(reviews)
    changes = seed.build_changes(products, reviews, [], profiles)
    assert reviews == original
    assert len(changes) == len(reviews)-1
    assert len({row['after'] for row in changes}) == len(changes)
    assert {row['product_id'] for row in changes} == {str(p['id']) for p in products}
    for change in changes:
        assert change['stars'] == reviews[change['id']-1]['so_sao']
        assert change['after'].startswith(seed.PREFIX)
        assert change['product_name'] in change['after']
        assert 'Freeze' not in change['after']
    assert not any(row['id'] == 99999 for row in changes)


@pytest.mark.parametrize('pid', [9,25,38,74,85,119,120])
def test_food_hot_and_merchandise_never_inherit_iced_drink_options(dataset, pid):
    products, _, profiles = dataset
    product = next(p for p in products if p['id'] == pid)
    contexts = seed.valid_order_context(product, profiles[pid], [dict(size='L', toppings=['Hạt Sen'],
        luong_da='Ít đá', do_ngot='50% Đường', loai_sua='Sữa Yến Mạch')])
    for stars in range(1,6):
        comment = seed.generate_comment(product, profiles[pid], stars, stars*8, contexts)
        assert 'Ít đá' not in comment and '50%' not in comment and 'size L' not in comment
        if pid != 38:
            assert not contexts and 'Hạt Sen' not in comment
        if pid == 74:
            assert 'khẩu vị' not in comment and 'món này' not in comment


def test_toppings_and_options_require_both_actual_order_and_current_menu(dataset):
    products, _, profiles = dataset
    product = next(p for p in products if p['id'] == 35)
    details = [dict(size='M', toppings=['Hạt Sen (+10k)', 'Không có trong Menu'],
        luong_da='100% Đá', do_ngot='30% Đường', loai_sua='Sữa Yến Mạch')]
    assert seed.valid_order_context(product, profiles[35], details) == [
        'Mình chọn size Vừa.', 'Phần thêm của mình có Hạt Sen.']
    details[0]['toppings'] = []
    assert seed.valid_order_context(product, profiles[35], details) == ['Mình chọn size Vừa.']
    assert not seed.valid_order_context(product, profiles[35], details*2)


def test_old_unknown_toppings_are_never_renamed_to_a_current_recipe():
    assert seed.matching_option('Trân Châu Trắng (+10k)', {'Trân châu trắng': 10000}) == 'Trân châu trắng'
    assert seed.matching_option('Kem Cheese (+12k)', {'Kem Phô Mai Macchiato': 10000}) is None
    assert seed.matching_option('Thạch Cà Phê (+10k)', {'Thạch Sương Sáo': 10000}) is None


@pytest.mark.parametrize('change', ['name','missing'])
def test_new_or_renamed_catalog_items_require_a_reviewed_profile(dataset, change):
    products, _, profiles = dataset
    if change == 'name':
        products[0]['name'] = 'Món đã đổi'
    else:
        products[0]['id'] = 9999
    with pytest.raises(ValueError):
        seed.validate_catalog(products, profiles)


def test_preparing_again_is_idempotent_and_cannot_rewrite_new_customer_reviews(dataset):
    products, reviews, profiles = dataset
    changes = seed.build_changes(products, reviews, [], profiles)
    by_id = {row['id']: row['after'] for row in changes}
    for review in reviews:
        if review['id'] in by_id:
            review['binh_luan'] = by_id[review['id']]
    assert not seed.build_changes(products, reviews, [], profiles)


@pytest.mark.parametrize('stars', [1,2,3,4,5])
def test_sentiment_follows_preserved_rating(dataset, stars):
    products, _, profiles = dataset
    product = next(p for p in products if p['id'] == 6)
    text = seed.generate_comment(product, profiles[6], stars, 3)
    assert 'Americano Yuzu' in text
    if stars <= 2:
        assert f'{stars} sao' in text and 'hợp gu mình.' not in text
    elif stars == 3:
        assert 'tạm ổn' in text
    elif stars == 4:
        assert 'nhưng' in text
    else:
        assert 'Rất hợp gu mình.' in text


def test_apply_aborts_atomically_if_a_review_changed_after_prepare(tmp_path, dataset):
    products, reviews, profiles = dataset
    changes = seed.build_changes(products, reviews[:1], [], profiles)
    backup = dict(products=products, reviews=reviews[:1], order_details=[])
    plan = dict(version=seed.VERSION, backup_hash=seed.digest(backup),
        catalog_hash=seed.digest(products), profiles_hash=seed.digest(profiles), changes=changes)
    seed.write_private(tmp_path/'backup.json', backup)
    seed.write_private(tmp_path/'plan.json', plan)
    seen = []
    class Result:
        def mappings(self): return self
        def __iter__(self): return iter(products)
        def fetchall(self): return []  # expected old comment was changed by a customer
    class Transaction:
        def __enter__(self): return self
        def __exit__(self, kind, value, trace): seen.append('rollback' if kind else 'commit')
        def execute(self, statement, params=None):
            sql = str(statement)
            if 'UPDATE orders.danh_gia_san_pham' in sql:
                assert 'SET binh_luan=x.replacement' in sql
                assert 'r.so_sao=x.stars' in sql and 'r.binh_luan IS NOT DISTINCT FROM x.expected' in sql
                assert 'ma_don_hang=' not in sql and 'so_sao=' not in sql.split('SET ')[1].split(' FROM ')[0]
            return Result()
    class Engine:
        def begin(self): return Transaction()
    with pytest.raises(ValueError, match='rolled back'):
        seed.apply_plan(Engine(), tmp_path)
    assert seen == ['rollback']
    assert Path(tmp_path/'backup.json').stat().st_mode & 0o777 == 0o600


def test_restore_requires_intact_backup_before_any_database_write(tmp_path):
    seed.write_private(tmp_path/'backup.json', {'reviews': []})
    seed.write_private(tmp_path/'plan.json', dict(version=seed.VERSION, backup_hash='tampered'))
    with pytest.raises(ValueError, match='backup'):
        seed.apply_plan(None, tmp_path, restore=True)
