"""Opt-in qualification on the real warehouse; never run at server startup.

python -m evals.qualify_one_click --mode scripted|live --output /tmp/result.json
Live reservations persist in Redis across invocations, with an explicitly
approved hard TOTAL cap (12 by default, 24 only with supplemental consent).
Credentials are inherited from the container and never copied into artifacts.
"""
import argparse
from datetime import date, timedelta
import json
import logging
import os
from pathlib import Path
import time
from uuid import uuid4
from unittest.mock import patch

from common import AiTextToReportRequest
from evals.one_click_cases import CASES, intent
from services.agent_pipeline import AnalysisPipeline
from services.agent_provider import NativeAgentProvider
from services.analysis_catalog import AnalysisError
from services.analysis_job_service import AnalysisJobs, JobRepository, TERMINAL
from services.session_service import storage
from tests.agent_fixtures import ScriptedProvider, call


def oracle(case, reference):
    """Separate authored totals SQL, independent of planner/compiler output."""
    from db import get_db_conn
    days=60 if case['id']=='vouchers' else 30
    start,end=reference-timedelta(days=days-1),reference+timedelta(days=1)
    status="trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')"
    if case['id']=='kiosks':
        sql=f"""SELECT SUM(tong_tien) FILTER (WHERE {status}) AS store_revenue,
            COUNT(*) AS order_count,
            SUM(tong_tien) FILTER (WHERE {status})/NULLIF(COUNT(*) FILTER (WHERE {status}),0) AS aov
            FROM silver.don_hang o JOIN silver.chi_nhanh s ON o.co_so_ma=s.ma_chi_nhanh
            WHERE s.loai_diem_ban IN ('KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH')
            AND (o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s
            AND (o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < %s"""
    elif case['id']=='products':
        sql=f"""SELECT SUM(i.so_luong) AS quantity_sold,SUM(i.thanh_tien) AS product_revenue
            FROM silver.chi_tiet_don_hang i JOIN silver.don_hang o ON i.ma_don_hang=o.ma_don_hang
            WHERE {status} AND (o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s
            AND (o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < %s"""
    elif case['id']=='payments':
        sql="""SELECT COUNT(*) AS payment_count,SUM(so_tien) AS payment_revenue
            FROM silver.giao_dich_thanh_toan
            WHERE (ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s
            AND (ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < %s"""
    elif case['id']=='vouchers':
        sql=f"""SELECT COUNT(ma_don_hang) AS voucher_order_count,
            SUM(tong_tien) FILTER (WHERE {status}) AS voucher_revenue,
            SUM(so_tien_giam) FILTER (WHERE {status}) AS discount_amount
            FROM silver.don_hang WHERE ma_voucher IS NOT NULL
            AND (ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s
            AND (ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < %s"""
    else:
        sql="""SELECT COUNT(*) AS shift_count,
            COUNT(*) FILTER (WHERE trang_thai_cham_cong='DI_TRE') AS late_count
            FROM silver.ca_lam_viec_nhan_vien WHERE ngay_lam_viec >= %s AND ngay_lam_viec < %s"""
    conn=get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('SET TRANSACTION READ ONLY')
            cur.execute('SET LOCAL statement_timeout = 4000')
            cur.execute(sql,(start,end));result=dict(cur.fetchone())
            if case['id']=='cashier_shifts':
                cur.execute("""SELECT COUNT(*) AS reconciled_shifts,SUM(tien_mat_he_thong) AS system_cash_revenue,
                    SUM(chenh_lech) AS total_cash_difference FROM silver.ca_doi_soat
                    WHERE (ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s
                    AND (ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < %s""",(start,end))
                result.update(dict(cur.fetchone()))
        return {k:float(v) if v is not None else None for k,v in result.items()}
    finally:
        conn.rollback();conn.close()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mode',choices=['scripted','replay','live'],required=True)
    parser.add_argument('--case',action='append',choices=[c['id'] for c in CASES])
    parser.add_argument('--total-cap',type=int,choices=[12,24],default=12)
    parser.add_argument('--output',required=True);args=parser.parse_args()
    logging.getLogger('ai-analytics').setLevel(logging.WARNING)
    client=storage().client
    budget_key='analyst:qualification:one-click-20261009:provider-sends'
    client.set(budget_key,0,nx=True)
    client.persist(budget_key)  # A long qualification must not reset paid sends.
    original_post=__import__('requests').post
    captures=[]
    def capped_post(url,**kwargs):
        if 'generativelanguage.googleapis.com' in url or 'api.groq.com' in url:
            n=client.incr(budget_key)
            if n>args.total_cap:
                client.decr(budget_key)
                raise AnalysisError('provider_call_budget_exceeded','Qualification total cap reached')
            response=original_post(url,**kwargs)
            # Save provider OUTPUT for free deterministic replays, never headers/key.
            try: captures.append(dict(send=n,status=response.status_code,body=response.json()))
            except ValueError: captures.append(dict(send=n,status=response.status_code))
            return response
        return original_post(url,**kwargs)
    outputs=[]
    transport_patch=patch('requests.post',capped_post)
    transport_patch.start()
    try:
        for case in CASES:
            if args.case and case['id'] not in args.case:continue
            remaining=args.total_cap-int(client.get(budget_key) or 0)
            if args.mode=='live' and remaining<=0:
                outputs.append(dict(case=case['id'],state='not_run',reason='total_cap_exhausted'));continue
            def factory(owner):
                from evals.one_click_replays import responses
                drafts=responses(case) if args.mode=='replay' else [intent(case)]
                provider=NativeAgentProvider() if args.mode=='live' else ScriptedProvider(*[
                    [call('submit_analysis_intent',draft)] for draft in drafts])
                return AnalysisPipeline(provider=provider,owner_id=owner)
            jobs=AnalysisJobs(JobRepository(client),factory)
            owner='qualification-'+uuid4().hex
            request=AiTextToReportRequest(question=case['question'],reference_date=date(2026,10,9),refresh=True)
            started=time.perf_counter()
            # Remaining consent, not a fresh per-process allowance. Cases are
            # sequential and every HTTP send also passes the durable total cap.
            allowance=min(3,remaining) if args.mode=='live' else 3
            with patch.dict(os.environ,{'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':str(allowance),
                'DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1' if allowance>1 else '0'}), patch('requests.post',capped_post):
                job=jobs.submit(request,owner,uuid4().hex)
                while job['state'] not in TERMINAL:
                    time.sleep(.1);job=jobs.status(job['job_id'],owner)
            report=job.get('result') or {}
            item=dict(case=case['id'],job_id=job['job_id'],state=job['state'],
                latency_ms=round((time.perf_counter()-started)*1000,2),calls=job['provider_call_count'],
                charts=len(report.get('charts',[])),query_count=report.get('diagnostics',{}).get('db_query_count'),
                stage_timings_ms=job.get('stage_timings_ms'),outcome=report.get('outcome'),
                error_category=report.get('diagnostics',{}).get('error_category'),
                contract_issues=report.get('diagnostics',{}).get('contract_issues'),report=report)
            if job['state']=='completed':
                expected=oracle(case,date(2026,10,9))
                from services.session_service import get_session
                session=get_session(report['session_id'])
                from services.result_artifact_store import artifact_store
                totals=[row for a in session.agent_artifacts.values() if not a.query.group_by and a.query.operation!='trend'
                    for row in (a.result or artifact_store().get(a.result_ref)).get('rows',[])]
                item['oracle']=expected
                # Independently reviewed COUNT(*) aliases, not discovered from
                # the produced plan or verifier. Same source/population/clock.
                aliases={'order_count':['order_count','store_order_count']} if case['id']=='kiosks' else {}
                item['oracle_match']={m:any(row.get(alias) is not None and abs(float(row[alias])-v)<.01
                    for row in totals for alias in aliases.get(m,[m])) if v is not None else
                    any(row.get(alias) is None for row in totals for alias in aliases.get(m,[m])) for m,v in expected.items()}
                # New idempotency key + same question should reuse a validated plan.
                request.refresh=False
                warm=jobs.submit(request,owner,uuid4().hex);warm_start=time.perf_counter()
                while warm['state'] not in TERMINAL:
                    time.sleep(.1);warm=jobs.status(warm['job_id'],owner)
                item['warm']=dict(state=warm['state'],calls=warm['provider_call_count'],
                    latency_ms=round((time.perf_counter()-warm_start)*1000,2),
                    query_count=(warm.get('result') or {}).get('diagnostics',{}).get('db_query_count'))
            jobs.pool.shutdown(wait=True)
            outputs.append(item)
            Path(args.output).write_text(json.dumps(dict(mode=args.mode,cases=outputs,
                total_live_sends=int(client.get(budget_key) or 0),provider_outputs=captures),ensure_ascii=False,default=str))
            print(json.dumps({k:v for k,v in item.items() if k not in {'report','contract_issues'}},ensure_ascii=False),flush=True)
    finally:
        transport_patch.stop()
        Path(args.output).write_text(json.dumps(dict(mode=args.mode,cases=outputs,
            total_live_sends=int(client.get(budget_key) or 0),provider_outputs=captures),ensure_ascii=False,default=str))


if __name__=='__main__':main()
