"""PLAN 20/10 §7.1: independent numeric oracles for the business-coverage metrics.

Expected values are plain Python over business definitions (status/type rules
from source services); the catalog expression only produces the actual value.
Fixtures carry the traps: pending vs success, paid vs outstanding, open vs
closed shifts, negative ledger signs, multi-select answers, NULL owners.
"""
import json
import sqlite3
import unittest

import sqlglot

from services.analysis_catalog import CATALOG_PATH

CATALOG = json.loads(CATALOG_PATH.read_text())
METRICS = CATALOG['analysis_registry']['metrics']

FIXTURES = {
    'vi_khach_hang_giao_dich': [
        dict(ma_giao_dich='t1', so_tien=100, loai_giao_dich='TOP_UP', trang_thai='SUCCESS', co_tham_chieu=1),
        dict(ma_giao_dich='t2', so_tien=50, loai_giao_dich='TOP_UP', trang_thai='PENDING', co_tham_chieu=0),
        dict(ma_giao_dich='t3', so_tien=30, loai_giao_dich='PAYMENT', trang_thai='SUCCESS', co_tham_chieu=0),
        dict(ma_giao_dich='t4', so_tien=20, loai_giao_dich='PAYMENT', trang_thai='SUCCESS', co_tham_chieu=1),
        dict(ma_giao_dich='t5', so_tien=7, loai_giao_dich='REFUND', trang_thai='SUCCESS', co_tham_chieu=1)],
    'the_qua_tang': [
        dict(ma_the='g1', menh_gia=100, so_du_hien_tai=100, trang_thai='ACTIVE'),
        dict(ma_the='g2', menh_gia=200, so_du_hien_tai=150, trang_thai='CLAIMED'),
        dict(ma_the='g3', menh_gia=300, so_du_hien_tai=0, trang_thai='REDEEMED')],
    'shipper_nop_cod': [dict(ma_phieu_nop='c1', so_tien=500, trang_thai='CONFIRMED'), dict(ma_phieu_nop='c2', so_tien=70, trang_thai='PENDING')],
    'cong_no_nhuong_quyen': [
        dict(ma_cong_no='d1', so_tien=1000, phi_phat_tre_han=0, trang_thai='DA_THANH_TOAN'),
        dict(ma_cong_no='d2', so_tien=400, phi_phat_tre_han=20, trang_thai='QUA_HAN'),
        dict(ma_cong_no='d3', so_tien=90, phi_phat_tre_han=0, trang_thai='CHUA_THANH_TOAN')],
    'royalty_nhuong_quyen': [dict(ma_royalty='r1', so_tien_royalty=60, trang_thai='DA_THANH_TOAN'), dict(ma_royalty='r2', so_tien_royalty=40, trang_thai='CHO_XAC_NHAN')],
    'don_mua_combo': [dict(ma_don_combo='o1', so_luong=2, tong_tien=900), dict(ma_don_combo='o2', so_luong=1, tong_tien=450)],
    'doi_soat_kiosk': [dict(ma_doi_soat='k1', muc_canh_bao='DO'), dict(ma_doi_soat='k2', muc_canh_bao='XANH')],
    'vi_chu_kiosk': [dict(ma_giao_dich='w1', so_tien=500, loai_giao_dich='NAP_TIEN'), dict(ma_giao_dich='w2', so_tien=-120, loai_giao_dich='TRA_CONG_NO')],
    'ca_kiosk': [dict(ma_ca_kiosk='s1', trang_thai='CLOSED', doanh_thu_he_thong=800, chenh_lech=-15),
                 dict(ma_ca_kiosk='s2', trang_thai='OPEN', doanh_thu_he_thong=300, chenh_lech=None),
                 dict(ma_ca_kiosk='s3', trang_thai='CLOSED', doanh_thu_he_thong=200, chenh_lech=5)],
    'gia_kiosk': [dict(ma_gia_kiosk=1, gia_kiosk=35, gia_niem_yet=30), dict(ma_gia_kiosk=2, gia_kiosk=25, gia_niem_yet=30), dict(ma_gia_kiosk=3, gia_kiosk=30, gia_niem_yet=None)],
    'khao_sat_tra_loi': [
        dict(ma_phan_hoi=1, thu_tu_cau=1, gia_tri='5', gia_tri_so=5), dict(ma_phan_hoi=1, thu_tu_cau=2, gia_tri='Cà phê', gia_tri_so=None),
        dict(ma_phan_hoi=1, thu_tu_cau=2, gia_tri='Trà', gia_tri_so=None), dict(ma_phan_hoi=2, thu_tu_cau=1, gia_tri='3', gia_tri_so=3)],
    'danh_gia_chi_nhanh': [dict(id=1, hien_thi_cong_khai='PUBLIC_VISIBLE'), dict(id=2, hien_thi_cong_khai='NOT_PUBLIC'), dict(id=3, hien_thi_cong_khai='UNKNOWN')],
    'giao_hang': [dict(ma_giao_hang='a', xung_dot_khoa_tai_xe=1), dict(ma_giao_hang='b', xung_dot_khoa_tai_xe=0), dict(ma_giao_hang='c', xung_dot_khoa_tai_xe=None)],
    'don_hang': [dict(ma_don_hang='o1', ma_nguoi_dung=None), dict(ma_don_hang='o2', ma_nguoi_dung='u1'), dict(ma_don_hang='o3', ma_nguoi_dung=None)],
    'kiosk': [dict(ma_kiosk_uuid='k1', khop_diem_ban=1), dict(ma_kiosk_uuid='k2', khop_diem_ban=0)],
    'vi_khach_hang': [dict(ma_vi='v1', so_du=40), dict(ma_vi='v2', so_du=0)],
    'vi_shipper': [dict(ma_vi='s1', so_du=10, cod_dang_giu=300), dict(ma_vi='s2', so_du=5, cod_dang_giu=0)],
    'ngoai_le_giao_hang': [dict(ma_ngoai_le=None)],  # placeholder row removed below: empty source must give 0
    'hoi_thoai_cskh': [dict(ma_hoi_thoai='h1', so_tin_nhan_chua_doc_nhan_su=2), dict(ma_hoi_thoai='h2', so_tin_nhan_chua_doc_nhan_su=0)],
    'tin_nhan_cskh': [dict(ma_tin_nhan=1), dict(ma_tin_nhan=2), dict(ma_tin_nhan=3)],
    'bai_viet': [dict(ma_bai_viet='a', da_xuat_ban=1, luot_xem_tich_luy=100), dict(ma_bai_viet='b', da_xuat_ban=0, luot_xem_tich_luy=50)],
    'ho_so_nhuong_quyen': [dict(ma_ho_so='x', trang_thai='DA_DUYET'), dict(ma_ho_so='y', trang_thai='TU_CHOI'), dict(ma_ho_so='z', trang_thai='CHO_XEM_XET')],
    'hop_dong_nhuong_quyen': [dict(ma_hop_dong='c1', trang_thai='HIEU_LUC'), dict(ma_hop_dong='c2', trang_thai='HET_HAN')],
    'thu_chi_nhuong_quyen': [],
    'thuong_loyalty_don': [dict(ma_don_hang='o1', diem_thuong=10, hang_truoc='SILVER', hang_sau='GOLD'),
                           dict(ma_don_hang='o2', diem_thuong=5, hang_truoc='GOLD', hang_sau='GOLD'),
                           dict(ma_don_hang='o3', diem_thuong=3, hang_truoc=None, hang_sau='SILVER')],
    'topping_don_hang': [dict(ma_dong=1, thu_tu=1, topping='Kem Cheese'), dict(ma_dong=1, thu_tu=2, topping='Hạt Sen'), dict(ma_dong=2, thu_tu=1, topping='Kem Cheese')],
    'giao_dich_thanh_toan': [dict(so_tien=100, trang_thai='SUCCESS'), dict(so_tien=20, trang_thai='THANH_CONG'), dict(so_tien=5, trang_thai='DA_THANH_TOAN'),
                             dict(so_tien=70, trang_thai='CHO_THU_TIEN'), dict(so_tien=9, trang_thai='THAT_BAI')],
}
FIXTURES['ngoai_le_giao_hang'] = []
F = FIXTURES
rows = lambda t, **kw: [r for r in F[t] if all(r.get(k) == v for k, v in kw.items())]
EXPECTED = {
    'wallet_topup_amount': sum(r['so_tien'] for r in rows('vi_khach_hang_giao_dich', loai_giao_dich='TOP_UP', trang_thai='SUCCESS')),
    'wallet_spend_amount': sum(r['so_tien'] for r in rows('vi_khach_hang_giao_dich', loai_giao_dich='PAYMENT', trang_thai='SUCCESS')),
    'wallet_refund_amount': 7,
    'wallet_pending_topup_count': 1,
    'wallet_unreferenced_payment_count': 1,
    'gift_card_issued_count': 3, 'gift_card_issued_value': 600,
    'gift_card_outstanding_balance': 250,  # REDEEMED never counts as outstanding
    'gift_card_redeemed_count': 1,
    'cod_remitted_amount': 500, 'cod_pending_remit_amount': 70,
    'debt_outstanding_amount': 490, 'debt_overdue_amount': 400, 'debt_late_fee_amount': 20,
    'royalty_billed_amount': 100, 'royalty_paid_amount': 60,
    'combo_order_count': 2, 'combo_order_value': 1350, 'combo_units_ordered': 3,
    'kiosk_reconciliation_count': 2, 'kiosk_red_alert_count': 1,
    'owner_wallet_topup_amount': 500, 'owner_debt_payment_amount': 120,  # negative ledger sign shown positive
    'kiosk_shift_count': 3, 'kiosk_shift_revenue': 1000, 'kiosk_cash_difference': -10,  # open shift excluded
    'kiosk_price_override_count': 3, 'kiosk_price_above_list_count': 1,
    'survey_answer_count': 4, 'survey_respondent_count': 2, 'survey_scored_answer_count': 2, 'avg_survey_score': 4.0,
    'public_store_review_count': 1, 'delivery_driver_key_conflict_count': 1, 'anonymous_order_count': 2,
    'kiosk_count': 2, 'unmapped_kiosk_count': 1,
    'customer_wallet_balance': 40, 'shipper_cod_holding': 300, 'shipper_wallet_balance': 15, 'delivery_exception_count': 0,
    'support_conversation_count': 2, 'support_unread_customer_messages': 2, 'support_message_count': 3,
    'published_article_count': 1, 'article_view_total': 100,  # unpublished views excluded
    'franchise_application_count': 3, 'franchise_approved_count': 1, 'active_franchise_contract_count': 1,
    'franchise_cashbook_amount': 0,  # empty source is a true zero
    'loyalty_points_awarded': 18, 'tier_upgrade_count': 2,  # NULL -> SILVER is a tier change
    'topping_selection_count': 3,  # one line with two toppings = two selections
    'settled_payment_amount': 125, 'unsettled_payment_count': 2,  # three success spellings settle; attempts do not
    'sale_positions': None, 'paused_sale_positions': None,  # covered by test_business_coverage_availability
}


class BusinessCoverageOracleTests(unittest.TestCase):
    def test_catalog_expressions_match_independent_oracles(self):
        db = sqlite3.connect(':memory:')
        for table, data in FIXTURES.items():
            columns = sorted({k for r in data for k in r}) or sorted(c for c in CATALOG['silver_tables']['silver.' + table]['columns'])
            db.execute(f'CREATE TABLE {table} ({", ".join(columns)})')
            db.executemany(f'INSERT INTO {table} VALUES ({", ".join("?" * len(columns))})', [[r.get(c) for c in columns] for r in data])
        for metric, expected in EXPECTED.items():
            if expected is None:
                continue
            with self.subTest(metric=metric):
                meta = METRICS[metric]
                table = meta['source'].split('.', 1)[1]
                expression = meta['expression'].replace('silver.', '')
                sql = sqlglot.transpile(f'SELECT {expression} FROM {table}', read='postgres', write='sqlite')[0]
                self.assertAlmostEqual(expected, db.execute(sql).fetchone()[0])

    def test_every_new_active_metric_has_an_oracle(self):
        new = {m for m, d in METRICS.items() if d.get('lifecycle', {}).get('introduced_in') == 'business-coverage-20261020'}
        self.assertEqual(set(), new - set(EXPECTED))


if __name__ == '__main__':
    unittest.main()
