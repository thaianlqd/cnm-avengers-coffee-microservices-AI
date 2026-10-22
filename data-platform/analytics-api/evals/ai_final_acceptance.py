"""FINAL AI Data Analyst acceptance matrix (plan 2026-10-19 §13): domain × family × edge × depth, OFFLINE.

Production AnalysisPipeline + resolver + compiler + AST guard + FixtureWarehouse(rich_world) with a scripted intent per
case (this measures deterministic planning/execution/verification, NOT model understanding — that is the semantic eval).
HTTP and psycopg2 are blocked; no provider is reachable.

Expected floors, core lenses and honest limitation states are frozen in ai_final_expectations.json from the passing
pre-hardening corpus. ``static_audit`` remains a diagnostic, never permission to lower those expectations. Holdout
failure oracles corrupt data, permissions and artifacts independently. Any PLANNING_GAP fails the gate.

    python -m evals.ai_final_acceptance --out /app/evaluation/ai-data-final-20261019/acceptance.json [--cases D,F,E] [--holdout]
"""
import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from contextlib import ExitStack
from datetime import date
from unittest.mock import patch

SEP = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
AUG_SEP = {'kind': 'range', 'start': '2026-08-01', 'end': '2026-09-30'}
DEPTHS = ('focused', 'deep', 'comprehensive')


def R(domain, metrics, question, kind='aggregate', dims=(), time=SEP, ranking=None, features=(), filters=(), granularity=None):
    return dict(question=question, req=dict(id='r1', goal=question[:100], domain_id=domain, metric_ids=list(metrics),
        dimension_ids=list(dims), analysis_kind=kind, time=time, ranking=ranking, derived_features=list(features),
        filters=list(filters), **({'granularity': granularity} if granularity else {})))


def case(id, kind, family, spec, holdout=False, expect_error=None, depths=DEPTHS, reference=None):
    return dict(id=id, kind=kind, family=family, holdout=holdout, expect_error=expect_error, depths=list(depths),
                **({'reference': reference} if reference else {}), **spec)


HCM = dict(dimension='city', operator='eq', value='Hồ Chí Minh')
CASES = [
    # ---- A. domain scenarios (2 × 16 governed domains) ------------------------------------------------------------
    case('D01', 'domain', 'kpi', R('orders', ['revenue'], 'Doanh thu tháng 9 năm 2026', features=['scalar'])),
    case('D02', 'domain', 'comparison', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn theo chi nhánh tháng 9 năm 2026', dims=['store'])),
    case('D03', 'domain', 'ranking', R('order_items', ['quantity_sold'], 'Top 5 món bán chạy nhất theo số lượng tháng 9 năm 2026', kind='ranking',
         dims=['product'], ranking={'limit': 5, 'metric_id': 'quantity_sold'})),
    case('D04', 'domain', 'overview', R('order_items', ['item_revenue'], 'Doanh thu dòng món theo danh mục tháng 9 năm 2026', dims=['category'])),
    case('D05', 'domain', 'ranking', R('products', ['product_revenue'], 'Top 5 món có doanh thu cao nhất tháng 9 năm 2026', kind='ranking',
         dims=['product'], ranking={'limit': 5, 'metric_id': 'product_revenue'}), holdout=True),
    case('D06', 'domain', 'trend', R('products', ['quantity_sold'], 'Số lượng bán theo tuần tháng 9 năm 2026', kind='trend', granularity='week')),
    case('D07', 'domain', 'comparison', R('stores', ['store_revenue'], 'Doanh thu theo chi nhánh tháng 9 năm 2026', dims=['store'])),
    case('D08', 'domain', 'kpi', R('stores', ['store_aov'], 'AOV chi nhánh tháng 9 năm 2026', features=['scalar']), holdout=True),
    case('D09', 'domain', 'trend', R('customers', ['customer_count'], 'Số khách đăng ký theo tháng năm 2026', kind='trend',
         time={'kind': 'year', 'year': 2026}, granularity='month')),
    case('D10', 'domain', 'composition', R('customers', ['total_spent'], 'Tổng chi tiêu của khách hàng theo vai trò', dims=['customer_role'], time=None)),
    case('D11', 'domain', 'ranking', R('promotions', ['voucher_order_count'], 'Top 3 khuyến mãi có nhiều đơn dùng nhất tháng 9 năm 2026',
         kind='ranking', dims=['promotion'], ranking={'limit': 3, 'metric_id': 'voucher_order_count'})),
    case('D12', 'domain', 'kpi', R('promotions', ['discount_amount'], 'Tổng tiền giảm giá tháng 9 năm 2026', features=['scalar']), holdout=True),
    case('D13', 'domain', 'composition', R('payments', ['payment_count'], 'Số giao dịch thanh toán theo cổng thanh toán tháng 9 năm 2026',
         dims=['payment_gateway'])),
    case('D14', 'domain', 'trend', R('payments', ['payment_revenue'], 'Doanh thu thanh toán theo ngày tháng 9 năm 2026', kind='trend', granularity='day')),
    case('D15', 'domain', 'kpi', R('delivery', ['delivery_success_rate'], 'Tỷ lệ giao hàng thành công tháng 9 năm 2026', features=['scalar'])),
    case('D16', 'domain', 'comparison', R('delivery', ['avg_delivery_minutes'], 'Thời gian giao trung bình theo chi nhánh tháng 9 năm 2026',
         dims=['store']), holdout=True),
    case('D17', 'domain', 'composition', R('inventory', ['stock_quantity'], 'Tồn kho hiện tại theo danh mục', dims=['category'], time=None)),
    case('D18', 'domain', 'risk', R('inventory', ['low_stock_count'], 'Số món dưới định mức theo chi nhánh', dims=['store'], time=None)),
    case('D19', 'domain', 'kpi', R('product_reviews', ['avg_product_rating'], 'Điểm đánh giá món trung bình tháng 9 năm 2026', features=['scalar'])),
    case('D20', 'domain', 'composition', R('product_reviews', ['review_count'], 'Số lượt đánh giá món theo danh mục tháng 9 năm 2026', dims=['category'])),
    case('D21', 'domain', 'comparison', R('store_reviews', ['avg_store_rating'], 'Điểm đánh giá trung bình theo chi nhánh tháng 9 năm 2026',
         dims=['store'])),
    case('D22', 'domain', 'trend', R('store_reviews', ['store_review_count'], 'Số lượt đánh giá chi nhánh theo tuần tháng 9 năm 2026', kind='trend',
         granularity='week'), holdout=True),
    case('D23', 'domain', 'kpi', R('staff_shifts', ['late_shift_rate'], 'Tỷ lệ ca đi trễ tháng 9 năm 2026', features=['scalar'])),
    case('D24', 'domain', 'composition', R('staff_shifts', ['shift_count'], 'Số ca làm việc theo ca tháng 9 năm 2026', dims=['shift_name'])),
    case('D25', 'domain', 'comparison', R('cashier_reconciliation', ['total_cash_difference'], 'Chênh lệch tiền mặt theo chi nhánh tháng 9 năm 2026',
         dims=['store'])),
    case('D26', 'domain', 'kpi', R('cashier_reconciliation', ['reconciled_shifts'], 'Số ca đối soát tháng 9 năm 2026', features=['scalar'])),
    case('D27', 'domain', 'kpi', R('customer_surveys', ['survey_response_count'], 'Số phản hồi khảo sát tháng 9 năm 2026', features=['scalar'])),
    case('D28', 'domain', 'comparison', R('customer_surveys', ['survey_response_count'], 'Số phản hồi khảo sát theo chi nhánh tháng 9 năm 2026',
         dims=['store']), holdout=True),
    case('D29', 'domain', 'ranking', R('wishlist_favorites', ['favorite_count'], 'Top 5 món được yêu thích nhất tháng 9 năm 2026', kind='ranking',
         dims=['product'], ranking={'limit': 5, 'metric_id': 'favorite_count'})),
    case('D30', 'domain', 'composition', R('wishlist_favorites', ['favorite_count'], 'Lượt yêu thích theo danh mục tháng 9 năm 2026', dims=['category'])),
    case('D31', 'domain', 'composition', R('hourly', ['hourly_orders'], 'Số đơn theo giờ trong ngày tháng 9 năm 2026', kind='distribution', dims=['hour'])),
    case('D32', 'domain', 'kpi', R('hourly', ['hourly_orders'], 'Số đơn theo giờ, xem theo thứ trong tuần tháng 9 năm 2026', dims=['weekday']), holdout=True),
    # ---- B. question-family scenarios (2 × 9 families) ----------------------------------------------------------------
    case('F01', 'family', 'overview', R('orders', ['revenue', 'order_count'], 'Tổng quan doanh thu và số đơn tháng 9 năm 2026', features=['scalar'])),
    case('F02', 'family', 'overview', R('orders', ['order_count', 'aov'], 'Tổng quan số đơn và giá trị đơn trung bình tháng 9 năm 2026', features=['scalar'])),
    case('F03', 'family', 'kpi', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh', features=['scalar'], filters=[HCM])),
    case('F04', 'family', 'kpi', R('orders', ['order_completion_rate'], 'Tỷ lệ hoàn thành đơn tháng 9 năm 2026', features=['scalar']), holdout=True),
    case('F05', 'family', 'ranking', R('stores', ['store_revenue'], 'Top 3 chi nhánh doanh thu cao nhất tháng 9 năm 2026', kind='ranking',
         dims=['store'], ranking={'limit': 3, 'metric_id': 'store_revenue'})),
    case('F06', 'family', 'ranking', R('products', ['quantity_sold'], 'Top 3 món bán ít nhất theo số lượng tháng 9 năm 2026', kind='ranking',
         dims=['product'], ranking={'limit': 3, 'metric_id': 'quantity_sold', 'direction': 'bottom'}), holdout=True),
    case('F07', 'family', 'trend', R('orders', ['revenue'], 'Xu hướng doanh thu theo tuần từ 01/08/2026 đến 30/09/2026', kind='trend',
         time=AUG_SEP, granularity='week')),
    case('F08', 'family', 'trend', R('orders', ['order_cancellation_rate'], 'Xu hướng tỷ lệ hủy đơn theo tuần từ 01/08/2026 đến 30/09/2026',
         kind='trend', time=AUG_SEP, granularity='week')),
    case('F09', 'family', 'comparison', R('orders', ['revenue'], 'So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9 năm 2026', kind='comparison',
         dims=['city'], filters=[dict(dimension='city', operator='in', value=['Hồ Chí Minh', 'Hà Nội'])])),
    case('F10', 'family', 'comparison', R('orders', ['aov'], 'So sánh giá trị đơn trung bình theo hình thức nhận hàng tháng 9 năm 2026',
         dims=['order_type'])),
    case('F11', 'family', 'composition', R('orders', ['revenue'], 'Cơ cấu doanh thu theo hình thức nhận hàng tháng 9 năm 2026', kind='distribution',
         dims=['order_type'], features=['contribution_share'])),
    case('F12', 'family', 'composition', R('order_items', ['item_revenue'], 'Tỷ trọng doanh thu theo danh mục tháng 9 năm 2026', kind='distribution',
         dims=['category'], features=['contribution_share']), holdout=True),
    case('F13', 'family', 'forecast', dict(R('orders', ['revenue'], 'Dự báo doanh thu 7 ngày tới', kind='trend', granularity='day',
         time={'kind': 'range', 'start': '2026-08-01', 'end': '2026-09-30'}), forecast={'horizon': 7, 'unit': 'day'}), reference='2026-10-01'),
    case('F14', 'family', 'forecast', dict(R('orders', ['order_count'], 'Dự báo số đơn 14 ngày tới', kind='trend', granularity='day',
         time={'kind': 'range', 'start': '2026-08-01', 'end': '2026-09-30'}), forecast={'horizon': 14, 'unit': 'day'}), reference='2026-10-01'),
    case('F15', 'family', 'risk', R('orders', ['order_cancellation_rate'], 'Chi nhánh nào có tỷ lệ hủy đơn bất thường tháng 9 năm 2026',
         dims=['store'])),
    case('F16', 'family', 'risk', R('cashier_reconciliation', ['large_cash_discrepancy_shift_count'], 'Số ca lệch tiền lớn tháng 9 năm 2026',
         features=['scalar'])),
    case('F17', 'family', 'relationship', R('delivery', ['total_deliveries', 'driver_rating'], 'Quan hệ giữa tổng chuyến giao và điểm đánh giá shipper',
         kind='relationship', dims=['driver_id'], time=None)),
    case('F18', 'family', 'relationship', R('orders', ['revenue', 'order_cancellation_rate'], 'Tương quan doanh thu với tỷ lệ hủy theo chi nhánh tháng 9 năm 2026',
         kind='relationship', dims=['store'])),
    # ---- C. edge / non-happy scenarios ---------------------------------------------------------------------------------
    case('E01', 'edge', 'no_rows', R('orders', ['revenue'], 'Doanh thu tháng 9 năm 2026 tại Cần Thơ', features=['scalar'],
         filters=[dict(dimension='city', operator='eq', value='Cần Thơ')]), expect_error='insufficient_data', depths=['deep']),
    case('E02', 'edge', 'one_time_point', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn ngày 10/09/2026', features=['scalar'],
         time={'kind': 'range', 'start': '2026-09-10', 'end': '2026-09-10'})),
    case('E03', 'edge', 'snapshot_trend', R('inventory', ['stock_quantity'], 'Xu hướng tồn kho theo tuần', kind='trend', granularity='week', time=None),
         expect_error='historical', depths=['deep']),
    case('E04', 'edge', 'pinned_axes', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn tháng 9 năm 2026 tại Quán Tân Định Hồ Chí Minh',
         features=['scalar'], filters=[HCM, dict(dimension='store', operator='eq', value='Quán Tân Định')])),
    case('E05', 'edge', 'multi_requirement', dict(R('orders', ['revenue'], 'Doanh thu và tỷ lệ hủy đơn theo chi nhánh tháng 9 năm 2026', dims=['store']),
         extra=[dict(id='r2', goal='Tỷ lệ hủy theo chi nhánh', domain_id='orders', metric_ids=['order_cancellation_rate'], dimension_ids=['store'],
                     analysis_kind='aggregate', time=SEP, ranking=None, derived_features=[], filters=[])])),
    case('E06', 'edge', 'duplicate_requirement', dict(R('orders', ['revenue'], 'Doanh thu tháng 9 năm 2026', features=['scalar']),
         extra=[dict(id='r2', goal='Doanh thu', domain_id='orders', metric_ids=['revenue'], dimension_ids=[], analysis_kind='aggregate',
                     time=SEP, ranking=None, derived_features=['scalar'], filters=[])])),
    case('E07', 'edge', 'unequal_exposure', R('delivery', ['delivery_success_rate'], 'Tỷ lệ giao hàng thành công theo shipper tháng 9 năm 2026',
         dims=['driver_id'])),
    case('E08', 'edge', 'high_cardinality_entity', R('order_items', ['quantity_sold'], 'Số lượng bán theo món tháng 9 năm 2026', dims=['product'])),
    case('E09', 'edge', 'zero_numerator_scope', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn hình thức dùng tại chỗ tháng 9 năm 2026',
         features=['scalar'], filters=[dict(dimension='order_type', operator='eq', value='DUNG_TAI_CHO')])),
    case('E11', 'edge', 'zero_denominator', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn đang giao tháng 9 năm 2026', features=['scalar'],
         filters=[dict(dimension='order_status', operator='eq', value='DANG_GIAO')]), expect_error='', depths=['deep']),
    case('E12', 'edge', 'period_comparison', dict(R('orders', ['revenue'], 'Doanh thu tháng 9 năm 2026 so với tháng 8 năm 2026', features=['scalar'],
         time={'kind': 'month', 'year': 2026, 'month': 9}), comparison_time={'kind': 'month', 'year': 2026, 'month': 8})),
    case('E13', 'edge', 'top_n_vs_full_denominator', R('products', ['product_revenue'], 'Top 3 món doanh thu cao nhất và tỷ trọng đóng góp tháng 9 năm 2026',
         kind='ranking', dims=['product'], ranking={'limit': 3, 'metric_id': 'product_revenue'}, features=['contribution_share'])),
    case('E14', 'edge', 'cross_domain_multi_requirement', dict(R('orders', ['revenue'], 'Doanh thu và số giao dịch thanh toán tháng 9 năm 2026',
         features=['scalar']), extra=[dict(id='r2', goal='Số giao dịch', domain_id='payments', metric_ids=['payment_count'], dimension_ids=[],
         analysis_kind='aggregate', time=SEP, ranking=None, derived_features=['scalar'], filters=[])])),
    case('E15', 'edge', 'partial_future_period', R('orders', ['revenue'], 'Doanh thu tháng 10 năm 2026', features=['scalar'],
         time={'kind': 'month', 'year': 2026, 'month': 10}), expect_error='insufficient_data', depths=['deep']),
    case('E16', 'edge', 'excluded_value_scope', R('orders', ['order_cancellation_rate'], 'Tỷ lệ hủy đơn tháng 9 năm 2026 ở Hồ Chí Minh và Hà Nội',
         features=['scalar'], filters=[dict(dimension='city', operator='in', value=['Hồ Chí Minh', 'Hà Nội'])])),
    # Observed live (2026-10-20): the model split one question into a degenerate "by pinned city" view + the scalar.
    case('E17', 'edge', 'degenerate_pinned_grouping', dict(R('orders', ['order_cancellation_rate'], 'tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh',
         features=['scalar'], filters=[HCM]), extra=[dict(id='r2', goal='Tỷ lệ hủy theo thành phố', domain_id='orders',
         metric_ids=['order_cancellation_rate'], dimension_ids=['city'], analysis_kind='aggregate', time=SEP, ranking=None,
         derived_features=[], filters=[HCM])])),
    case('E10', 'edge', 'mission_grammar', dict(R('orders', ['revenue'], 'Doanh thu theo chi nhánh tháng 9 năm 2026', dims=['store']), mission='compare')),
]

# Separate holdout failure contracts: no demo phrasing, chart-count padding or
# dynamic expected state from the planner under test. Oracles execute production
# owners with independently corrupted data/access/artifacts and exact assertions.
HARDENING_EDGES = [
    ('E18','all_null','tests.test_ai_final_edges.FinalEdgeTests.test_all_null_measure_never_becomes_zero'),
    ('E19','source_missing','tests.test_ai_final_edges.FinalEdgeTests.test_missing_source_fails_before_connection_with_source_category'),
    ('E20','source_stale_incomplete','tests.test_ai_final_edges.FinalEdgeTests.test_stale_incomplete_source_cannot_claim_report_complete'),
    ('E21','access_denied','tests.test_workspace_revision.WorkspaceRevisionTests.test_permission_denied_cannot_fallback_to_global_report'),
    ('E22','join_fanout','tests.test_ai_final_edges.FinalEdgeTests.test_governed_join_avoids_fact_multiplication_and_rejects_fanout_axis'),
    ('E23','budget_timeout','tests.test_ai_final_edges.FinalEdgeTests.test_timeout_and_query_budget_have_no_hidden_retry'),
    ('E24','saved_tamper','tests.test_ai_final_edges.FinalEdgeTests.test_saved_chart_lens_evidence_and_denominator_tamper_rejected'),
    ('E25','ui_response_race','node:workspaceInteraction.test.mjs'),
    ('E26','cancel_revoke',['tests.test_ai_final_edges.FinalEdgeTests.test_cancelled_revision_cannot_publish',
                           'tests.test_workspace_revision.WorkspaceRevisionTests.test_revoke_during_revision_prevents_atomic_publication']),
    ('E27','identity_filter_scope','tests.test_workspace_revision.WorkspaceRevisionTests.test_identity_filter_pins_label_axis_without_hiding_the_exact_answer'),
    ('E29','filtered_ratio_population','tests.test_workspace_revision.WorkspaceRevisionTests.test_filter_recompiles_ratio_on_full_population_without_provider'),
]


def run_hardening_edge(spec, ui_oracle=None):
    import unittest
    id, family, oracle = spec
    if id == 'E25':
        if not ui_oracle: return dict(id=id,kind='edge',family=family,holdout=True,passed=False,problems=['Source-bound UI oracle required'],runs={})
        receipt=json.loads(Path(ui_oracle).read_text())
        web=Path(__file__).resolve().parents[2]/'web-ui'
        valid=receipt.get('case_id')==id and receipt.get('exit_code')==0 and receipt.get('passed')==3
        for name, fingerprint in receipt.get('source_files',{}).items():
            valid = valid and hashlib.sha256((web/name).read_bytes()).hexdigest()==fingerprint
        valid = valid and set(receipt.get('source_files',{}))=={'src/utils/workspaceInteraction.mjs','src/utils/workspaceInteraction.test.mjs'}
        return dict(id=id,kind='edge',family=family,holdout=True,passed=valid,problems=[] if valid else ['UI oracle identity mismatch'],runs={},oracle=oracle)
    result=unittest.TestResult()
    names=oracle if isinstance(oracle,list) else [oracle]
    unittest.defaultTestLoader.loadTestsFromNames(names).run(result)
    valid=result.testsRun==len(names) and result.wasSuccessful() and not result.skipped
    return dict(id=id,kind='edge',family=family,holdout=True,passed=valid,
                problems=[] if valid else [message[-1500:] for _,message in result.errors+result.failures],runs={},oracle=oracle)


def static_audit(catalog, case_, depth, reference):
    """Planned lenses per role from metadata only (no SQL) — the frozen eligibility proof for this case/depth."""
    from services.analytical_resolver import AnalyticalResolver
    from services.analysis_intent import AnalysisIntentEnvelope
    from services.analysis_expansion_service import view_targets, FIXED_GROUPING_POLICY
    reqs = [dict(case_['req'], **({'forecast': case_['forecast']} if case_.get('forecast') else {}),
                 **({'comparison_time': case_['comparison_time']} if case_.get('comparison_time') else {}))] + case_.get('extra', [])
    ui = {'server_supporting_expansion': depth, 'fixed_grouping_policy':FIXED_GROUPING_POLICY,
          **({'analysis_mission': case_['mission']} if case_.get('mission') else {})}
    try:
        resolved = AnalyticalResolver(catalog, reference, ui).resolve(AnalysisIntentEnvelope.model_validate({'decision': 'analyze', 'requirements': reqs}))
    except Exception as error:  # noqa: BLE001 - the audit records the typed category, never hides it
        return dict(state='PRECHECK_ERROR', error=getattr(error, 'category', type(error).__name__))
    plan = resolved.get('lens_plan') or {}
    targets = view_targets(catalog, depth)
    planned = {r: sum(1 for c in resolved['coverage'] for l in c.get('lenses', []) if l['role'] == r and not l.get('reserve')) for r in targets}
    reasons = sorted({d.get('reason') for d in plan.get('decisions', []) if d.get('status') == 'rejected' and d.get('reason')})
    return dict(planned=planned, targets=targets, family=plan.get('family'), reasons=reasons,
                operations=len(resolved['operations']))


def run_case(case_, depth, reference):
    from tests import test_hybrid_v28 as f
    from evals.fixture_warehouse import FixtureWarehouse
    from services.analysis_quality_service import verify_saved_report
    from services.analysis_catalog import AnalysisCatalog
    from tests.analysis_fixtures import physical_metadata
    catalog = AnalysisCatalog(physical_metadata())
    warehouse = FixtureWarehouse(catalog.overlay)
    req = dict(case_['req'], **({'forecast': case_['forecast']} if case_.get('forecast') else {}),
               **({'comparison_time': case_['comparison_time']} if case_.get('comparison_time') else {}))
    envelope = f.envelope(req, *case_.get('extra', []))
    from services.analysis_pipeline import AnalysisPipeline
    from unittest.mock import Mock
    p = AnalysisPipeline(metadata_loader=physical_metadata, provider=f.scripted(envelope), executor=warehouse,
                         value_lookup=Mock(return_value=[]), owner_id='owner-a')
    p.value_lookup = lambda table, column, value, **kw: [value]
    from common import AiTextToReportRequest
    request = AiTextToReportRequest(question=case_['question'], reference_date=reference, analysis_depth=depth,
                                    **({'analysis_mission': case_['mission']} if case_.get('mission') else {}))
    started = time.perf_counter()
    try:
        proposal = p.propose(request)
        f.approve(request, proposal)
        report = p.generate(request)
    except Exception as error:  # noqa: BLE001
        return dict(error=getattr(error, 'category', type(error).__name__), message=str(error)[:200])
    finally:
        warehouse.close()
    elapsed = time.perf_counter() - started
    cov = report.get('analysis_coverage') or {}
    charts = report['charts']
    return dict(error=None, elapsed_s=round(elapsed, 2), sql_executions=warehouse.call_count, queries=len(report['analytical_queries']),
        requested_meaning_sha256=hashlib.sha256(json.dumps(sorted(
            [q for q in report['analytical_queries'] if q['role']=='requested'],key=lambda q:q['id']),sort_keys=True).encode()).hexdigest(),
        singleton_views=[c['id'] for c in charts if c['chart_type'] in {'bar','horizontal_bar','line','area','donut','scatter'} and len(c.get('data',[]))<2],
        requested_rows=[report['result_sets'][q['id']]['rows'] for q in report['analytical_queries'] if q['role'] == 'requested'],
        charts=[dict(type=c['chart_type'], metrics=c['metrics'], lens=c.get('analysis_lens_id'), role=c.get('analysis_lens_role') or 'requested')
                for c in charts], forecast_views=len(report.get('forecasts') or []),
        unique_views=len({c.get('semantic_view_key') for c in charts}) == len(charts),
        coverage={k: cov.get(k) for k in ('status', 'gap_kind', 'counted', 'targets', 'rendered_total', 'target_total', 'selection_origin')},
        rejected=[(l['id'], l['reason']) for l in cov.get('lenses', []) if l['status'] == 'rejected'],
        verified=report['quality_assessment']['status'], breadth=(report['quality_assessment'].get('analysis_breadth') or {}).get('status'),
        reconciliation=(report.get('verification') or {}).get('status'),
        reverified=verify_saved_report(report, catalog) == report['quality_assessment'],
        short_answer=report.get('short_answer'), conclusion=(report.get('conclusion') or {}).get('answer'))


def allowed_metrics(catalog, case_):
    metrics = set(case_['req']['metric_ids']) | {m for r in case_.get('extra', []) for m in r['metric_ids']}
    for m in list(metrics):
        metrics |= {v for k, v in (catalog.registry['metrics'][m].get('components') or {}).items() if k.endswith('_metric')}
    return metrics


def judge(catalog, case_, audits, runs):
    """Gate one case across its depths. Returns (passed, problems)."""
    problems = []
    frozen = json.loads(Path(__file__).with_name('ai_final_expectations.json').read_text())['cases'][case_['id']]
    for depth,run in runs.items():
        if run.get('error') != frozen[depth]['expected_error']:
            problems.append(f'{depth}: error category differs from frozen failure oracle')
    if case_['expect_error'] == '':
        for depth, run in runs.items():
            if not run.get('error') and run.get('verified') != 'verified':
                problems.append(f'{depth}: unverified report {run.get("verified")}')
        return not problems, problems
    if case_['expect_error']:
        for depth, run in runs.items():
            if not run.get('error') or case_['expect_error'] not in str(run.get('error')) + str(run.get('message')):
                if not (case_['expect_error'] == 'historical' and run.get('error') in {'insufficient_data', 'historical_data_unavailable'}):
                    problems.append(f'{depth}: expected {case_["expect_error"]}, got {run.get("error")}')
        return not problems, problems
    allowed = allowed_metrics(catalog, case_)
    lens_sets = {}
    for depth, run in runs.items():
        if run.get('error'):
            problems.append(f'{depth}: error {run["error"]} {run.get("message")}')
            continue
        audit = audits[depth]
        bad = [c for c in run['charts'] if not set(c['metrics']) <= allowed]
        if bad:
            problems.append(f'{depth}: irrelevant views {[c["metrics"] for c in bad]}')
        if not run['unique_views']:
            problems.append(f'{depth}: duplicate views')
        if run['singleton_views']:
            problems.append(f'{depth}: singleton fake views')
        plain = [frozenset(c['metrics']) for c in run['charts'] if c['type'] == 'scatter' and not c['lens']]
        if len(plain) != len(set(plain)):  # the same pair on the same rows drawn twice (axes swapped)
            problems.append(f'{depth}: same scatter pair drawn twice')
        if run['queries'] > 8:
            problems.append(f'{depth}: {run["queries"]} logical operations > 8')
        if run.get('reconciliation') not in (None, 'verified'):
            problems.append(f'{depth}: independent verification {run.get("reconciliation")}')
        if run['verified'] != 'verified' or not run['reverified']:
            problems.append(f'{depth}: verification {run["verified"]} reverified={run["reverified"]} breadth={run["breadth"]}')
        cov = run['coverage']
        expected = frozen[depth]
        if (cov.get('status'),cov.get('gap_kind')) != (expected['expected_status'],expected['expected_gap']):
            problems.append(f'{depth}: frozen coverage state differs')
        if cov.get('rendered_total',0) < expected['min_views']:
            problems.append(f'{depth}: fewer useful views than frozen independent floor')
        if expected.get('max_views') is not None and cov.get('rendered_total',0) > expected['max_views']:
            problems.append(f'{depth}: forbidden views counted despite metadata capability proof')
        if not set(expected['core_lenses']) <= {c['lens'] for c in run['charts'] if c['role']=='core'}:
            problems.append(f'{depth}: frozen core lenses lost')
        if cov.get('gap_kind') in {'PLANNING_GAP', 'SOURCE_UNAVAILABLE'}:
            problems.append(f'{depth}: {cov["gap_kind"]} rejected={run["rejected"]}')
        rich = audit.get('planned') and all(audit['planned'][r] >= audit['targets'][r] for r in audit['targets']) if 'planned' in audit else False
        if rich and cov.get('status') != 'complete' and cov.get('gap_kind') != 'LIMITED_DATA':
            problems.append(f'{depth}: rich-eligible but {cov.get("status")} {cov.get("gap_kind")}')
        lens_sets[depth] = {c['lens'] for c in run['charts'] if c['lens']}
    ordered = [lens_sets[d] for d in DEPTHS if d in lens_sets]
    core = [{c['lens'] for c in runs[d]['charts'] if c['role'] == 'core'} for d in DEPTHS if d in lens_sets]
    if any(len(c) and core[0] - c for c in core[1:]):
        problems.append('core lenses not preserved across depths')
    rows = [runs[d]['requested_rows'] for d in DEPTHS if d in lens_sets]
    if any(r != rows[0] for r in rows[1:]):
        problems.append('requested numbers differ across depths')
    meanings=[runs[d]['requested_meaning_sha256'] for d in DEPTHS if d in lens_sets]
    if any(m!=meanings[0] for m in meanings[1:]):
        problems.append('requested scope/population/metric meaning differs across depths')
    return not problems, problems


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--kinds', default='domain,family,edge')
    parser.add_argument('--holdout-only', action='store_true')
    parser.add_argument('--ui-oracle', help='Receipt from tools/run_workspace_ui_oracle.py, bound to actual JS source')
    args = parser.parse_args(argv)
    os.environ.update(AI_OFFLINE='1', DATA_ANALYST_ENV='development', DATA_ANALYST_SESSION_STORE='memory', DATA_ANALYST_ARTIFACT_STORE='memory',
                      DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN='3', DATA_ANALYST_ENABLE_CONTRACT_REPAIR='1')
    reference = date(2026, 10, 8)
    from evals import fixture_warehouse as w
    from evals.rich_fixture import rich_world
    from services.analysis_catalog import AnalysisCatalog
    from tests.analysis_fixtures import physical_metadata
    manifest = json.dumps(dict(cases=CASES,holdouts=HARDENING_EDGES,
        expectations=json.loads(Path(__file__).with_name('ai_final_expectations.json').read_text())), sort_keys=True, ensure_ascii=False, default=str)
    results, started = [], time.perf_counter()
    with ExitStack() as stack:
        for target in ('requests.sessions.Session.request', 'psycopg2.connect'):
            stack.enter_context(patch(target, side_effect=AssertionError('External transport forbidden')))
        stack.enter_context(patch.dict(w.DATA, rich_world()))
        catalog = AnalysisCatalog(physical_metadata())
        for c in CASES:
            if c['kind'] not in args.kinds.split(',') or (args.holdout_only and not c['holdout']):
                continue
            ref = date.fromisoformat(c['reference']) if c.get('reference') else reference
            audits = {d: static_audit(catalog, c, d, ref) for d in c['depths']}
            runs = {d: run_case(c, d, ref) for d in c['depths']}
            passed, problems = judge(catalog, c, audits, runs)
            results.append(dict(id=c['id'], kind=c['kind'], family=c['family'], holdout=c['holdout'], passed=passed, problems=problems,
                                audit=audits, runs={d: {k: v for k, v in r.items() if k != 'requested_rows'} for d, r in runs.items()}))
            print(('PASS ' if passed else 'FAIL ') + c['id'], '' if passed else problems, flush=True)
        if 'edge' in args.kinds.split(','):
            for edge in HARDENING_EDGES:
                result=run_hardening_edge(edge,args.ui_oracle)
                results.append(result)
                print(('PASS ' if result['passed'] else 'FAIL ')+edge[0],result['problems'],flush=True)
    summary = dict(total=len(results), passed=sum(r['passed'] for r in results),
                   by_kind={k: [sum(r['passed'] for r in results if r['kind'] == k), sum(r['kind'] == k for r in results)] for k in ('domain', 'family', 'edge')},
                   rich_full=sum(1 for r in results for d, run in r['runs'].items() if not run.get('error') and (run['coverage'] or {}).get('status') == 'complete'),
                   runs=sum(len(r['runs']) for r in results), elapsed_s=round(time.perf_counter() - started, 1))
    receipt = dict(generated_at=time.strftime('%Y-%m-%dT%H:%M:%S%z'), manifest_sha256=hashlib.sha256(manifest.encode()).hexdigest(),
                   mode='offline_scripted_intent_rich_fixture', summary=summary, results=results)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf8') as handle:
        json.dump(receipt, handle, ensure_ascii=False, indent=1, default=str)
    print(json.dumps(summary))
    return 0 if summary['passed'] == summary['total'] else 1


if __name__ == '__main__':
    sys.path.insert(0, '.')
    raise SystemExit(main())
