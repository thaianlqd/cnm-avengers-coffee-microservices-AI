"""Customer identity, route permissions, and menu/branch sellability contracts."""
import json
import logging
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from src.agents import order_flow_graph as graph
from src.common import cart_manager
from src.common.inventory_validation import availability_at_branch, validate_items_at_branch
from src.function_calling.tools import product_tools, branch_tools
from test_canonical_conversation_references import catalog, session, business_state, options_runtime
from test_natural_knowledge_routing import forbid_writes


@pytest.mark.parametrize('query,owner', [('Cacao Đồi review sao?', 'review'),
    ('Cacao Đồi giá bao nhiêu?', 'price'), ('Cacao Đồi còn hàng không?', 'inventory')])
@pytest.mark.parametrize('pending', [None, 'select_voucher', 'confirm_checkout', 'fill_options'])
def test_first_business_read_establishes_only_identity(catalog, monkeypatch, caplog, query, owner, pending):
    rows, _ = catalog
    sid = session(rows, pending)
    before = business_state(sid)
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools, 'execute_get_product_insights', Mock(return_value={'status':'ok','message':'Chưa có đánh giá.'}))
    price = Mock(return_value={'status':'ok','products':[dict(rows[1], final_price=47000)]})
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', price)
    with caplog.at_level(logging.INFO):
        graph.run_order_flow(sid, query)
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == rows[1]
    assert business_state(sid) == before
    trace = json.loads(next(r.message.split('decision_provenance=',1)[1]
        for r in reversed(caplog.records) if 'decision_provenance=' in r.message))
    assert trace['authority_owner'] == owner and trace['active_pending_type'] == pending
    assert not trace['mutation_authorized_by_route'] and not trace['mutation_evidence_present']
    # Explicit new identity overrides the first read; follow-up uses that ID.
    graph.run_order_flow(sid, 'Trà Vườn review sao?')
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == rows[0]
    graph.run_order_flow(sid, 'giá bn?')
    assert price.call_args.kwargs['product_name_query'] == rows[0]['product_name']
    assert business_state(sid) == before


def test_review_price_add_options_cart_exactly_once(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    adds = options_runtime(monkeypatch, rows)
    monkeypatch.setattr(product_tools, 'execute_get_product_insights', lambda *a, **k: {'status':'ok','message':'Chưa có đánh giá.'})
    graph.run_order_flow(sid, 'Cacao Đồi review sao?')
    priced = graph.run_order_flow(sid, 'giá bn?')
    assert priced['tool_calls_log'][0]['result']['products'][0]['product_id'] == rows[1]['product_id']
    graph.run_order_flow(sid, 'thêm món này')
    assert not adds and not cart_manager.get_cart(sid)['items']
    assert cart_manager.get_pending_action(sid)['type'] == 'fill_options'
    assert [row['product_id'] for row in cart_manager.get_checkout_prefs(sid)['pending_products']] == [rows[1]['product_id']]
    graph.run_order_flow(sid, 'mặc định hết', client_message_id='one-default-turn')
    graph.run_order_flow(sid, 'mặc định hết', client_message_id='one-default-turn')
    assert [row['product_id'] for row in adds] == [rows[1]['product_id']]
    assert [row['product_id'] for row in cart_manager.get_cart(sid)['items']] == [rows[1]['product_id']]


@pytest.mark.parametrize('kind', ['PRODUCT_REVIEW','PRODUCT_INFO'])
@pytest.mark.parametrize('count', [0,1,2])
def test_read_focus_is_generic_and_never_guesses_from_multiple_results(catalog, kind, count):
    rows, _ = catalog
    sid = session(rows)
    before = business_state(sid)
    graph._render({'session_id':sid,'intent':{'intent':kind,'products':rows[:count]},
                   'result':{'reply':'fixture','tool_calls_log':[]}})
    assert business_state(sid) == before
    assert cart_manager.get_checkout_prefs(sid).get('last_product_focus') == (rows[0] if count == 1 else None)


@pytest.mark.parametrize('query', ['Cacao Đồi review sao?', 'giá bn?', 'còn hàng không?', 'món này vị sao?'])
def test_identity_read_preserves_same_product_option_retry(catalog, monkeypatch, query):
    rows, _ = catalog
    sid = session(rows)
    focus = dict(rows[1], quantity=2, option_retry_pending=True)
    cart_manager.set_checkout_context(sid,last_product_focus=focus)
    adds = options_runtime(monkeypatch,rows)
    monkeypatch.setattr(product_tools,'execute_get_product_insights',lambda *a,**k:{'status':'ok','message':'Chưa có đánh giá.'})
    before = business_state(sid)
    graph.run_order_flow(sid,query)
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == focus
    assert business_state(sid) == before and not adds
    graph.run_order_flow(sid,'thử lại')
    prefs = cart_manager.get_checkout_prefs(sid)
    assert prefs['pending_action']['type'] == 'fill_options'
    assert prefs['pending_products'][0]['product_id'] == rows[1]['product_id']
    assert prefs['pending_products'][0]['quantity'] == 2 and not adds
    assert not prefs['last_product_focus'].get('option_retry_pending')


@pytest.mark.parametrize('query', ['Trà Không Tồn Tại giá bao nhiêu?',
    'món này Trà Không Tồn Tại review sao?', 'Trà review sao?', 'Trà Vườn và Cacao Đồi giá bao nhiêu?'])
def test_unresolved_business_read_cannot_reuse_old_focus(catalog, monkeypatch, query):
    rows, _ = catalog
    sid = session(rows)
    cart_manager.set_checkout_context(sid, last_product_focus=rows[2])
    before = business_state(sid)
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools, 'execute_get_product_insights', Mock(side_effect=AssertionError('guessed review')))
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', Mock(side_effect=AssertionError('guessed price')))
    graph.run_order_flow(sid, query)
    assert business_state(sid) == before
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == rows[2]


@pytest.mark.parametrize('label', ['đồ uống','thức uống','nước','bánh','đồ ăn'])
def test_grouped_alias_ordinals_use_shared_category(catalog, label):
    rows, _ = catalog
    food = [dict(product_id='food-'+str(i), product_name='Bánh '+str(i), category='food') for i in range(1,3)]
    sid = session(food + rows)
    cart_manager.set_checkout_context(sid, product_suggestion_snapshots={'drink':rows, 'food':food})
    resolved, invalid, count = graph._resolve_product_ordinals(sid, label+' số 2')
    assert count == 1 and not invalid
    assert resolved == [rows[1] if label in {'đồ uống','thức uống','nước'} else food[1]]


@pytest.mark.parametrize('message', ['voucher số 2', 'chi nhánh số 2', 'địa chỉ số 2', 'dòng số 2', 'thanh toán số 2'])
def test_other_namespace_cannot_resolve_products(catalog, message):
    rows, _ = catalog
    assert graph._resolve_product_ordinals(session(rows), message) == ([], [], 0)


@pytest.mark.parametrize('owner,decision,authorized', [('select_voucher','SELECT_VOUCHER',True),
    ('select_voucher','REMOVE_VOUCHER',True), ('select_voucher','SKIP_VOUCHER',False),
    ('select_voucher','AMBIGUOUS',False), ('confirm_checkout','CONFIRM',True),
    ('confirm_checkout','REJECT',False), ('confirm_checkout','CHANGE',False)])
def test_pending_route_provenance_uses_classified_decision(catalog, monkeypatch, caplog, owner, decision, authorized):
    rows, _ = catalog
    sid = session(rows, owner)
    intent = {'intent':'PENDING_REPLY', 'pending_type':owner, 'decision':decision}
    monkeypatch.setattr(graph, '_GRAPH', SimpleNamespace(invoke=lambda _: {'intent':intent, 'result':{'reply':'fixture','tool_calls_log':[]}}))
    with caplog.at_level(logging.INFO):
        graph.run_order_flow(sid, 'fixture reply')
    trace = json.loads(next(r.message.split('decision_provenance=',1)[1]
        for r in reversed(caplog.records) if 'decision_provenance=' in r.message))
    assert trace['mutation_authorized_by_route'] is authorized
    assert trace['semantic_operation'] == decision and trace['active_pending_type'] == owner
    assert not trace['mutation_evidence_present']


CASES = json.loads((Path(__file__).resolve().parents[3]/'contracts/customer-availability-cases.json').read_text())


class Engine:
    def __init__(self, products, inventory):
        self.products, self.inventory = products, inventory
    def connect(self):
        return self
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def execute(self, statement, params):
        pid = params['product_id']
        if '.san_pham' in str(statement):
            row = (self.products[pid],) if pid in self.products else None
        else:
            if self.inventory is None:
                raise OSError('inventory unavailable')
            override = next((row for row in self.inventory if row['ma_san_pham'] == pid), None)
            row = (override['dang_kinh_doanh'],) if override else None
        return SimpleNamespace(fetchone=lambda:row)


@pytest.mark.parametrize('case', CASES, ids=lambda case:case['name'])
def test_same_sellability_contract_as_customer_web(case):
    result = availability_at_branch(Engine({901:case['active']}, case['inventory']), 'SYNTHETIC',
        [{'product_id':'901','product_name':'Produit Alpha'}])
    assert result['product_statuses'] == [{'product_id':'901','product_name':'Produit Alpha','status':case['expected']}]
    assert result['is_fully_available'] is (case['expected'] == 'AVAILABLE')


def test_branch_matrix_exact_sets_and_unknown_identity():
    items = [{'product_id':str(i),'product_name':name} for i,name in [(901,'Alpha'),(902,'Beta'),(903,'Gamma')]]
    a = availability_at_branch(Engine({901:True,902:True,903:True},[{'ma_san_pham':903,'dang_kinh_doanh':False}]), 'A', items)
    b = availability_at_branch(Engine({901:True,902:True,903:True},[]), 'B', items)
    assert a['available'] == ['Alpha','Beta'] and a['unavailable'] == ['Gamma'] and not a['unverified']
    assert not a['is_fully_available'] and b['is_fully_available']
    assert b['available'] == ['Alpha','Beta','Gamma'] and not b['unavailable']
    assert validate_items_at_branch(Engine({},[]), 'A', items)['unverified'] == ['Alpha','Beta','Gamma']


@pytest.mark.parametrize('mode', ['GIAO_TAN_NOI','MANG_DI','TAI_CHO'])
@pytest.mark.parametrize('global_active', [True, False])
def test_real_branch_discovery_matrix_chooses_only_compatible_outlets(monkeypatch, mode, global_active):
    sid = 'matrix-'+uuid4().hex
    for pid,name in [(901,'Alpha'),(902,'Beta')]:
        cart_manager.add_item(sid,str(pid),name,20000)
    cart_manager.set_checkout_prefs(sid,delivery_type=mode)
    rows = [dict(ma_chi_nhanh=code,ten_chi_nhanh='Branch '+code,dia_chi='Fixture '+code,
        vi_do=distance,kinh_do=0,avg_rating=0,total_reviews=0,loai='CHI_NHANH_CHINH')
        for code,distance in [('A',0.1),('B',0.2),('C',0.3),('FAR',6)]]
    class BranchEngine(Engine):
        def execute(self, statement, params=None):
            if 'branches_and_kiosks' in str(statement):
                return SimpleNamespace(mappings=lambda:SimpleNamespace(all=lambda:rows))
            self.inventory = ([{'ma_san_pham':902,'dang_kinh_doanh':False,'so_luong_ton':100}]
                              if params['branch_id'] == 'A' else [])
            return super().execute(statement,params)
    engine = BranchEngine({901:True,902:global_active},[])
    monkeypatch.setattr(branch_tools,'_get_engine',lambda:engine)
    monkeypatch.setattr(branch_tools,'_check_business_hours',lambda:None)
    monkeypatch.setattr('utils.geo.haversine_distance',lambda a,b,lat,lng:lat)
    result = branch_tools.execute_find_nearest_branch('Fixture location',session_id=sid,
        resolved_location={'lat':0,'lng':0,'normalized_label':'Fixture location'})
    matrix = result.get('availability_branches') or result['branches']
    assert matrix[0]['available_products'] == ['Alpha']
    assert matrix[0]['unavailable_products'] == ['Beta'] and not matrix[0]['is_fully_available']
    if mode == 'GIAO_TAN_NOI':
        assert all(row['ma_chi_nhanh'] != 'FAR' for row in matrix)
        if global_active:
            assert result['status'] == 'ok' and result['branches'][0]['ma_chi_nhanh'] == 'B'
            assert matrix[1]['available_products'] == ['Alpha','Beta']
            assert matrix[1]['unavailable_products'] == [] and matrix[1]['is_fully_available']
        else:
            assert result['status'] == 'stock_conflict'
            assert all(not row['is_fully_available'] for row in matrix)
    else:
        assert result['status'] == 'need_branch_selection'
        assert result['branches'][0]['ma_chi_nhanh'] == 'A'  # Explicit selection still required.
        assert cart_manager.get_pending_action(sid)['type'] == 'select_branch'
        assert not cart_manager.get_cart(sid).get('branch_id')


def test_direct_voucher_route_logs_authorization_before_apply(catalog, monkeypatch, caplog):
    from src.function_calling.tools import voucher_tools
    rows, _ = catalog
    sid = session(rows)
    cart_manager.add_item(sid,rows[0]['product_id'],rows[0]['product_name'],20000)
    cart_manager.set_checkout_context(sid,voucher_candidates=[{'ma_voucher':'SYNTHETIC'}],voucher_offer_pending=True)
    monkeypatch.setattr(graph,'_understand',lambda state:{**state,'intent':{'intent':'SELECT_VOUCHER'}})
    # The compiled graph retains the original node, so invoke the actual executor/render directly.
    monkeypatch.setattr(graph,'_GRAPH',SimpleNamespace(invoke=lambda state:graph._render(graph._execute({
        **state,'cart':cart_manager.get_cart(sid),'intent':{'intent':'SELECT_VOUCHER'}}))))
    writes=[]
    monkeypatch.setattr(voucher_tools,'execute_apply_voucher',lambda sid,code:writes.append(code) or {'status':'ok'})
    with caplog.at_level(logging.INFO):
        graph.run_order_flow(sid,'chọn mã số 1')
    assert writes == ['SYNTHETIC']
    trace = json.loads(next(r.message.split('decision_provenance=',1)[1]
        for r in reversed(caplog.records) if 'decision_provenance=' in r.message))
    assert trace['mutation_authorized_by_route'] and trace['mutation_evidence_present']
    assert trace['semantic_operation'] == 'APPLY_VOUCHER' and trace['reference_namespace'] == 'VOUCHER'


@pytest.mark.parametrize('owner,message,tool', [('select_voucher','áp dụng mã số 1','apply_voucher'),
    ('select_voucher','bỏ qua voucher',None), ('confirm_checkout','xác nhận','confirm_checkout')])
def test_real_pending_routes_report_authorization_without_changing_handlers(catalog, monkeypatch, caplog, owner, message, tool):
    from src.function_calling.tools import voucher_tools, cart_tools
    rows, _ = catalog
    sid = session(rows,owner)
    cart_manager.add_item(sid,rows[0]['product_id'],rows[0]['product_name'],20000)
    cart_manager.set_checkout_context(sid,voucher_candidates=[{'ma_voucher':'SYNTHETIC'}],voucher_offer_pending=True)
    cart_manager.set_pending_action(sid,owner,{})
    writes=[]
    monkeypatch.setattr(voucher_tools,'execute_apply_voucher',lambda *a,**k:writes.append('apply_voucher') or {'status':'ok'})
    monkeypatch.setattr(cart_tools,'execute_confirm_checkout',lambda *a,**k:writes.append('confirm_checkout') or {'status':'success','order_id':'synthetic-order'})
    before = deepcopy(cart_manager.get_cart(sid)['items'])
    with caplog.at_level(logging.INFO):
        result = graph.run_order_flow(sid,message)
    assert writes == ([tool] if tool else [])
    assert [entry['tool'] for entry in result['tool_calls_log']] == writes
    trace = json.loads(next(r.message.split('decision_provenance=',1)[1]
        for r in reversed(caplog.records) if 'decision_provenance=' in r.message))
    assert trace['active_pending_type'] == owner
    assert trace['mutation_authorized_by_route'] is bool(tool)
    assert trace['mutation_evidence_present'] is bool(tool)
    assert cart_manager.get_cart(sid)['items'] == before
