"""Authored semantic robustness fixtures; production never imports this module."""
from copy import deepcopy
from tests.test_hybrid_v28 import requirement, envelope, SCENARIO_A


def load_cases():
    cases=[]
    def add(group,index,meaning,**extra):
        cases.append(dict(id=f'{group}_{index:02}',group=group,question='Phân tích theo lựa chọn đã nêu',
                          provider_envelopes=[meaning],expected='proposal_ready',**extra))
    pairs=[(['product_revenue','quantity_sold'],['product'],1),(['revenue','aov'],['city'],1),
        (['revenue','order_count','aov'],['city'],2),(['stock_quantity','low_stock_count'],['store'],1),
        (['voucher_revenue','discount_amount','voucher_order_count'],['promotion'],2)]
    for i in range(20):
        metrics,dims,count=pairs[i%5]
        req=requirement(metric_ids=metrics,dimension_ids=dims,ranking=None,derived_features=[],analysis_kind='aggregate',time=None)
        add('compound',i,envelope(req),expected_metrics=metrics,expected_operations=count)
    metrics=['revenue','quantity_sold','voucher_revenue','payment_count','stock_quantity','customer_count','total_deliveries',
        'review_count','store_review_count','shift_count','total_cash_difference','survey_response_count','favorite_count','hourly_orders','store_revenue']
    for i in range(15):
        selected=[metrics[i],metrics[(i+1)%15]]
        reqs=[requirement(id=f'r{j+1}',metric_ids=[m],dimension_ids=[],analysis_kind='aggregate',ranking=None,derived_features=[],time=None) for j,m in enumerate(selected)]
        add('multi_domain',i,envelope(*reqs),expected_metrics=selected,expected_operations=2)
    features=['leader','top_gap','selected_total','contribution_share','concentration','change','change_pct','group_gap','relationship_strength','contribution_share']
    for i,feature in enumerate(features):
        kind='distribution' if feature=='concentration' else 'trend' if feature in {'change','change_pct'} else 'aggregate' if feature=='group_gap' else 'relationship' if feature=='relationship_strength' else 'ranking'
        req=requirement(metric_ids=['product_revenue','quantity_sold'] if kind=='relationship' else ['product_revenue'],derived_features=[feature],analysis_kind=kind,
            ranking={'limit':5+i,'metric_id':'product_revenue'} if kind=='ranking' else None,
            dimension_ids=[] if kind=='trend' else ['product'],granularity='week' if kind=='trend' else None)
        add('derived_feature',i,envelope(req),expected_metrics=req['metric_ids'])
    hints=['item_sales','product_volume','voucher_usage','payment_mix','sales_overview','category_mix','delivery_volume','store_performance','unknown_hint',None]
    for i,hint in enumerate(hints):
        add('lens_conflict',i,envelope(requirement(lens_hint=hint)),question_override=SCENARIO_A,expected_operations=2,expected_metrics=['product_revenue','quantity_sold'])
    for i in range(10):
        first=requirement(metric_ids=['quantity_sold'],ranking={'limit':i+1,'metric_id':'quantity_sold'},derived_features=[],time=None)
        omitted=requirement(id='r2',metric_ids=['product_revenue'],ranking=None,analysis_kind='aggregate',derived_features=[],time=None)
        add('omitted_component',i,envelope(first),repair=envelope(omitted),question_override='Số lượng bán và doanh thu sản phẩm',expected_calls=2,expected_metrics=['quantity_sold','product_revenue'])
    for i in range(10):
        accepted=requirement(id='r1',metric_ids=['revenue'],dimension_ids=[],ranking=None,analysis_kind='aggregate',derived_features=[],time=None)
        bad=requirement(id='r2',metric_ids=['unknown_metric'],ranking={'limit':i+1,'metric_id':'quantity_sold'},derived_features=[])
        fixed={**bad,'metric_ids':['quantity_sold']}
        add('repair_preservation',i,envelope(accepted,bad),repair=envelope(fixed),expected_calls=2,expected_metrics=['revenue','quantity_sold'],frozen=['r1'])
    periods=['today','7d','30d','current_month','previous_month','current_quarter','previous_quarter','current_year','previous_year','all_time']
    for i,period in enumerate(periods):
        req=requirement(derived_features=[],filters=[{'dimension':'city','value':'TP.HCM'}])
        add('structured_scope',i,envelope(req),time={'mode':period},expected_metrics=['product_revenue','quantity_sold'])
    for i in range(5):
        req=requirement(metric_ids=[],dimension_ids=[],ranking=None,derived_features=[],analysis_kind=None,availability='unsupported',reason='definition_unavailable')
        add('unsupported_data',i,envelope(req),expected_override='needs_clarification',expected_outcome='UNSUPPORTED')
    for i,m in enumerate(['stock_quantity','low_stock_count','total_spent','total_deliveries','driver_rating'],5):
        req=requirement(metric_ids=[m],dimension_ids=[],ranking=None,analysis_kind='aggregate',derived_features=[])
        add('unsupported_data',i,envelope(req),expected_override='needs_clarification',expected_outcome='INSUFFICIENT_DATA')
    for i in range(10):
        base=envelope(requirement(derived_features=[]))
        delta={'changes':[{'action':'update','requirement_id':'r1','changes':{'ranking':{'limit':i+1,'metric_id':'product_revenue'}}}]}
        add('refinement_delta',i,base,delta=delta,expected_metrics=['product_revenue','quantity_sold'])
    malformed=[{}, {'decision':'analyze','requirements':'bad'}, {'decision':'analyze','requirements':[{'id':'r1'}]},
        {'decision':'analyze','requirements':[]},{'decision':'plan','requirements':[]}]
    for i,bad in enumerate(malformed):
        add('malformed_envelope',i,bad,repair=envelope(requirement()),expected_calls=2,expected_metrics=['product_revenue','quantity_sold'])
    for case in cases:
        if 'repair' in case:case['provider_envelopes'].append(case.pop('repair'))
        if 'question_override' in case:case['question']=case.pop('question_override')
        if 'expected_override' in case:case['expected']=case.pop('expected_override')
    return deepcopy(cases)
