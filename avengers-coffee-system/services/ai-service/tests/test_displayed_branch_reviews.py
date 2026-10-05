"""Reported branch-review followup; fake model/services, no live keys or network."""
from copy import deepcopy
import json
import pytest
from test_llm_tool_orchestrator import runtime
from src.common import cart_manager, groq_service
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.agent_context import build_context
from src.agents.tool_artifacts import ToolArtifacts, model_tool_result
from src.agents.tool_policy import GuardedToolGateway
from src.agents.tool_capabilities import capabilities_for_context
from src.agents.branch_reviews import displayed_review_selection, review_request, review_reply
from src.function_calling.tools import branch_tools, branch_review_tools

MESSAGE = 'tôi muốn xem đánh giá của các chi nhánh này, chi nhánh nào được đánh giá tốt nhất nhỉ'


@pytest.fixture
def branches(runtime, monkeypatch):
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    ConversationMemory(runtime.redis).save(runtime.sid, empty_memory())
    rows = [dict(ma_chi_nhanh=f'B{i}', ten_chi_nhanh=f'Chi nhánh {i} Tân Phú', dia_chi=f'{i} Đường A') for i in range(1, 6)]
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', lambda **kwargs: {'status':'ok', 'branches':deepcopy(rows)})
    runtime.provider.plan([('find_nearest_branch', {'location':'Phường Tân Phú, TP.HCM'})])
    result = runtime.turn('cho tôi xem các chi nhánh ở phường tân phú tp hồ chí minh')
    assert len(result['ui_payload']['branches']) == 5
    reads = []
    ratings = [dict(branch_id=f'B{i}', branch_name=f'Chi nhánh {i} Tân Phú', total_reviews=10+i,
                    avg_rating=4 + i/10, reviews=[{'rating':5, 'comment':f'Nhân viên chi nhánh {i} phục vụ tốt.'}]) for i in range(1, 6)]
    def compare(ids):
        reads.append(deepcopy(ids))
        return {'status':'ok', 'reviewed_branches':[deepcopy(r) for r in ratings if r['branch_id'] in ids]}
    monkeypatch.setattr(branch_review_tools, 'execute_compare_branch_reviews', compare)
    def forbidden(*a, **kw): raise AssertionError('Displayed reviews must not call a provider, including during a 503 outage')
    monkeypatch.setattr(groq_service, 'groq_agent_chat', forbidden)
    return ratings, reads


def test_reported_journey_reads_only_all_five_displayed_stores_without_model(runtime, branches):
    _, reads = branches
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    before_prefs = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    memory_before = ConversationMemory(runtime.redis).load(runtime.sid)['visible_snapshots']['branches']
    first = runtime.turn(MESSAGE)
    assert first['error'] is None and reads == [['B1','B2','B3','B4','B5']]
    assert '4.50/5' in first['reply'] and '15 đánh giá' in first['reply']
    assert 'Nhân viên chi nhánh 5 phục vụ tốt.' in first['reply']
    assert '**Có điểm trung bình cao nhất:** Chi nhánh 5 Tân Phú' in first['reply']
    assert 'thành phần' not in first['reply'] and 'Trợ lý AI đang' not in first['reply']
    assert [r['tool'] for r in first['tool_calls_log']] == ['compare_branch_reviews']
    assert len(runtime.provider.requests) == 1 and not runtime.writes
    assert {k:v for k,v in cart_manager.get_cart(runtime.sid).items() if k != 'checkout_prefs'} == {k:v for k,v in before.items() if k != 'checkout_prefs'}
    after = cart_manager.get_checkout_prefs(runtime.sid)
    assert all(after.get(k) == v for k,v in before_prefs.items() if k != 'processed_order_turns')
    assert ConversationMemory(runtime.redis).load(runtime.sid)['visible_snapshots']['branches'] == memory_before


def test_numbered_review_references_branch_namespace_not_products(runtime, branches):
    _, reads = branches
    result = runtime.turn('cho tôi xem đánh giá chi nhánh số 2')
    assert reads[-1] == ['B2'] and 'Chi nhánh 2 Tân Phú' in result['reply']
    assert 'Chi nhánh 5' not in result['reply']


def test_missing_or_invalid_display_reference_clarifies_without_read_or_model(runtime, branches):
    _, reads = branches
    result = runtime.turn('xem đánh giá chi nhánh số 9')
    assert not result['tool_calls_log'] and not reads and 'chưa xác định' in result['reply']
    ConversationMemory(runtime.redis).save(runtime.sid, empty_memory())
    result = runtime.turn(MESSAGE)
    assert not result['tool_calls_log'] and 'gửi tên chi nhánh' in result['reply']


def test_equal_ratings_no_text_and_unrated_branches_are_not_invented(runtime, branches):
    ratings, _ = branches
    ratings[0].update(avg_rating=5, total_reviews=1, reviews=[])
    ratings[1].update(avg_rating=5, total_reviews=100, reviews=[])
    ratings[2].update(avg_rating=None, total_reviews=0, reviews=[])
    result = runtime.turn(MESSAGE)
    assert '**Cùng có điểm trung bình cao nhất:** Chi nhánh 1 Tân Phú, Chi nhánh 2 Tân Phú' in result['reply']
    assert 'chưa đủ dữ liệu để xếp hạng' in result['reply']
    assert 'Chưa có nhận xét bằng chữ' in result['reply']
    assert '0.00/5' not in result['reply']


def test_database_failure_is_not_ingredient_fallback_or_fake_ranking(runtime, branches, monkeypatch):
    monkeypatch.setattr(branch_review_tools, 'execute_compare_branch_reviews', lambda ids: {'status':'unavailable','message':'Chưa đọc được đánh giá, bạn thử lại nhé.'})
    result = runtime.turn(MESSAGE)
    assert result['reply'] == 'Chưa đọc được đánh giá, bạn thử lại nhé.'
    assert not runtime.writes


def scoped_gateway(runtime, message):
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    context,_ = build_context(runtime.sid, memory)
    artifacts = ToolArtifacts(memory, message, context)
    return GuardedToolGateway(runtime.sid, message, context, artifacts, 'offline-turn')


def test_model_cannot_expand_scope_or_choose_global_top_list(runtime, branches):
    _, reads = branches
    gateway = scoped_gateway(runtime, MESSAGE)
    schemas,_ = gateway.tool_surface()
    names = {r['function']['name'] for r in schemas}
    assert 'compare_branch_reviews' in names
    assert 'search_knowledge_base' not in names and 'get_top_rated_stores' not in names
    for ids in [['B1','outside'], ['B1'], ['B1','B1']]:
        result = gateway.dispatch('compare_branch_reviews', {'branch_ids':ids})
        assert result['status'] == 'branch_review_scope_mismatch'
    assert not reads
    result = gateway.dispatch('compare_branch_reviews', {'branch_ids':['B5','B4','B3','B2','B1']})
    assert reads == [['B1','B2','B3','B4','B5']]


def test_wrong_rag_cannot_override_scoped_review_request(runtime, branches):
    gateway = scoped_gateway(runtime, MESSAGE)
    denied = gateway.dispatch('search_knowledge_base', {'query':MESSAGE})
    assert denied['status'] == 'wrong_authority'
    gateway.artifacts.collect('search_knowledge_base', {}, {'status':'ok', 'results':[{'id':'bad','content':'Thông tin thành phần phải dựa trên mô tả sản phẩm.'}]})
    reply = gateway.artifacts.validate_reply(json.dumps({'response_kind':'consultation','reply':'Thông tin thành phần', 'mutation_claims':[], 'evidence_quotes':[]}))
    assert 'thành phần' not in reply and 'chưa thể kết luận' in reply
    assert 'thành phần' not in gateway.artifacts.factual_fallback()


def test_global_and_named_reviews_have_tools_and_project_actual_ratings(runtime, branches):
    gateway = scoped_gateway(runtime, 'chi nhánh nào được đánh giá tốt nhất toàn hệ thống?')
    schemas,_ = gateway.tool_surface()
    assert {'get_top_rated_stores','get_store_reviews'} <= {r['function']['name'] for r in schemas}
    projected = model_tool_result('get_top_rated_stores', {'status':'ok','stores':[{'ten_chi_nhanh':'A','avg_rating':4.7,'total_reviews':50}]})
    assert projected['stores'][0]['avg_rating'] == 4.7
    ordinary,_ = build_context(runtime.sid, empty_memory())
    assert 'compare_branch_reviews' not in capabilities_for_context(ordinary)


@pytest.mark.parametrize('message', ['món nào được đánh giá cao?', 'cho tôi xem các chi nhánh ở Tân Phú', 'món cà phê này có sữa không?'])
def test_non_branch_review_requests_remain_in_their_own_domain(message):
    assert not review_request(message)


def test_no_reviews_and_rounding_do_not_create_a_winner_or_false_tie():
    rows = [{'branch_name':'A','avg_rating':None,'total_reviews':0}]
    assert 'chưa đủ đánh giá để kết luận' in review_reply({'status':'ok','reviewed_branches':rows})
    rows = [{'branch_name':'A','avg_rating':4.701,'total_reviews':100}, {'branch_name':'B','avg_rating':4.704,'total_reviews':100}]
    assert '**Có điểm trung bình cao nhất:** B.' in review_reply({'status':'ok','reviewed_branches':rows})


class Result:
    def __init__(self, rows): self.rows = rows
    def mappings(self): return self
    def all(self): return self.rows


class Engine:
    def __init__(self, missing=False, broken=False): self.calls, self.missing, self.broken = [], missing, broken
    def connect(self): return self
    def __enter__(self): return self
    def __exit__(self,*a): pass
    def execute(self, statement, params):
        sql = str(statement)
        self.calls.append((sql, deepcopy(params)))
        if self.broken: raise RuntimeError('Fake DB outage')
        if 'WITH branches' in sql:
            return Result([{'branch_id':'B1','branch_name':'A','avg_rating':4.6,'total_reviews':7}] if self.missing else
                [{'branch_id':'B2','branch_name':'B','avg_rating':None,'total_reviews':0}, {'branch_id':'B1','branch_name':'A','avg_rating':4.6,'total_reviews':7}])
        return Result([{'ma_chi_nhanh':'B1','rating':5,'comment':'Đồ uống ngon.'}])


def test_provider_batches_exact_ids_all_approved_rating_counts_and_comments_per_branch(monkeypatch):
    engine = Engine()
    monkeypatch.setattr(branch_review_tools,'_get_engine',lambda:engine)
    result = branch_review_tools.execute_compare_branch_reviews(['B1','B2'])
    assert result['status'] == 'ok'
    assert [b['branch_id'] for b in result['reviewed_branches']] == ['B1','B2']
    assert result['reviewed_branches'][0]['total_reviews'] == 7
    assert result['reviewed_branches'][1]['avg_rating'] is None
    assert result['reviewed_branches'][0]['reviews'][0]['comment'] == 'Đồ uống ngon.'
    assert len(engine.calls) == 2
    for sql,params in engine.calls:
        assert "trang_thai = 'APPROVED'" in sql and params['ids'] == ['B1','B2']
        assert 'B1' not in sql and 'B2' not in sql
    assert 'nhan_xet' not in engine.calls[0][0]  # Star-only reviews count toward average/count.
    assert 'PARTITION BY ma_chi_nhanh' in engine.calls[1][0] and 'position <= 3' in engine.calls[1][0]
    assert 'ngay_tao DESC, id DESC' in engine.calls[1][0]


@pytest.mark.parametrize('missing,broken,status', [(True,False,'not_found'), (False,True,'unavailable')])
def test_missing_store_and_database_outage_never_return_partial_comparison(monkeypatch,missing,broken,status):
    engine=Engine(missing,broken)
    monkeypatch.setattr(branch_review_tools,'_get_engine',lambda:engine)
    result=branch_review_tools.execute_compare_branch_reviews(['B1','B2'])
    assert result['status'] == status and 'reviewed_branches' not in result
    assert len(engine.calls)==1


@pytest.mark.parametrize('message,ids', [
    ('chi nhánh nào được đánh giá tốt nhất nhỉ', ['B1','B2','B3','B4','B5']),
    ('xem đánh giá của Chi nhánh 2 Tân Phú', ['B2']),
])
def test_implicit_comparison_and_known_name_use_current_branch_ids(runtime,branches,message,ids):
    _, reads=branches
    result=runtime.turn(message)
    assert reads == [ids] and result['error'] is None


def test_public_reviews_remain_available_to_guest_without_login(runtime,branches,monkeypatch):
    from src.function_calling.tools import cart_tools
    monkeypatch.setattr(cart_tools,'is_authenticated_cart_session',lambda sid:False)
    memory=ConversationMemory(runtime.redis).load(runtime.sid)
    context,_=build_context(runtime.sid,memory)
    context['business']['guest_session_id']='guest-test'
    artifacts=ToolArtifacts(memory,MESSAGE,context)
    gateway=GuardedToolGateway(runtime.sid,MESSAGE,context,artifacts,'offline-guest')
    result=gateway.dispatch('compare_branch_reviews',{'branch_ids':['B1','B2','B3','B4','B5']})
    assert result['status']=='ok' and not runtime.writes


def test_singular_reference_in_a_list_does_not_guess_the_first_branch(runtime,branches):
    _,reads=branches
    result=runtime.turn('cho tôi xem đánh giá chi nhánh này')
    assert 'chi nhánh nào trong danh sách' in result['reply'] and not reads


@pytest.mark.parametrize('message',['không muốn xem đánh giá các chi nhánh này nữa','gửi đánh giá chi nhánh số 1','xem đánh giá các chi nhánh này và đặt đơn giúp tôi'])
def test_decline_write_or_compound_request_is_not_a_direct_read(message):
    assert displayed_review_selection(message,[{'ma_chi_nhanh':'B1','display_index':1}]) is None
