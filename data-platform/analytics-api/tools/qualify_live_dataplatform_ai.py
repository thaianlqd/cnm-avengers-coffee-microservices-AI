"""Manual LIVE_PROVIDER qualification. Proposal only; never warehouse execution.

Usage: python -m tools.qualify_live_dataplatform_ai --url http://localhost:8501
Existing API credentials stay on the analytics server. This client does not read
or print provider keys. At most 3 submissions / 6 provider requests; reserve the
full 3-call ceiling before each submission, and stop on unknown accounting/auth/quota.
Not imported by CI or offline evaluation.
"""
import argparse
import json
import time
from pathlib import Path
import requests

QUESTIONS=[
    'Tổng hợp hoạt động kinh doanh trong 45 ngày gần nhất: doanh thu, số đơn và giá trị đơn trung bình. Hiển thị xu hướng theo tuần, so sánh doanh thu giữa các loại đơn và tính tỷ trọng doanh thu của từng loại. Làm rõ phạm vi trạng thái đơn dùng để tính từng chỉ số.',
    'Trong 30 ngày gần nhất, xếp hạng 5 sản phẩm bán chạy nhất theo số lượng bán. Với từng sản phẩm, hiển thị số lượng bán và doanh thu sản phẩm. Nêu rõ trạng thái đơn được tính.',
    'Trong 30 ngày gần nhất, thống kê số giao dịch và tổng số tiền giao dịch theo cổng thanh toán, đồng thời thống kê theo trạng thái giao dịch. Hiển thị xu hướng tổng số tiền giao dịch theo ngày. Không coi số tiền giao dịch là doanh thu đơn hàng.',
]


def qualify(url, session, max_submissions=3, max_requests=6, questions=None):
    records=[];used=0
    for number,question in enumerate((QUESTIONS if questions is None else questions)[:min(3,max_submissions)],1):
        if used+3>min(6,max_requests):
            break
        start=time.perf_counter()
        try:
            response=session.post(url.rstrip('/')+'/api/ai/propose-plan',json={'question':question},timeout=(2,31))
            response.raise_for_status();result=response.json();diag=result.get('diagnostics',{})
            count=diag.get('provider_call_count')
            known=type(count) is int and 0<=count<=3
            used+=count if known else 3
            category=diag.get('error_category') or diag.get('terminal_error')
            records.append(dict(submission=number,latency_ms=round((time.perf_counter()-start)*1000,2),
                question=question,
                status=result.get('status'),outcome=result.get('outcome'),provider_request_count=count if known else None,
                provider_attempt_latencies=diag.get('provider_attempt_latencies',[]),error_category=category,
                failure_stage=diag.get('failure_stage'),semantic_repair_count=diag.get('semantic_repair_count'),
                transport_retry_count=diag.get('transport_retry_count'),db_query_count=diag.get('db_query_count'),
                root_contract_issues=diag.get('root_contract_issues',[]),
                semantic_issue_history=diag.get('semantic_issue_history',[]),
                resolver_diagnostic=diag.get('resolver_diagnostic'),
                query_shapes=[{k:q.get(k) for k in ('subject','operation','metrics','group_by','time','ranking')}
                    for q in result.get('proposal',{}).get('analytical_queries',[])]))
            if not known or category in {'provider_auth','provider_daily_quota','provider_rate_limited','provider_access_denied','provider_configuration_missing','provider_offline'}:
                break
        except (requests.RequestException,ValueError):
            records.append(dict(submission=number,latency_ms=round((time.perf_counter()-start)*1000,2),
                status='client_transport_error',provider_request_count=None,error_category='qualification_transport',
                failure_stage='CLIENT_TRANSPORT'))
            break  # Server work/accounting may be unknown; never blindly retry.
    measured=all(r['provider_request_count'] is not None for r in records)
    return dict(measurement_scope='LIVE_PROVIDER',submission_count=len(records),
        LIVE_PROVIDER_REQUESTS=used if measured else None,provider_requests_upper_bound=used if measured else min(6,used+3),
        success_count=sum(r.get('status')=='proposal_ready' for r in records),
        failure_count=sum(r.get('status')!='proposal_ready' for r in records),WAREHOUSE_WRITES=0,records=records)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:8501')
    parser.add_argument('--question',action='append',help='Bounded proposal-only question; may be repeated.')
    parser.add_argument('--max-submissions',type=int,default=3)
    parser.add_argument('--max-requests',type=int,default=6)
    parser.add_argument('--output',type=Path,default=Path('/tmp/dataplatform-live-qualification.json'))
    args=parser.parse_args()
    with requests.Session() as session:
        result=qualify(args.url,session,args.max_submissions,args.max_requests,args.question)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
    return result['failure_count']>0


if __name__=='__main__':raise SystemExit(main())
