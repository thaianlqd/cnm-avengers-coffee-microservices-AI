import {test,expect} from '@playwright/test';
import {mockApi,CAPABILITIES,openAssistant,deferred} from './helpers';

function coverage(healthy=false){return {status:'ready',overall:{min_date:'2026-01-01',max_date:'2026-10-20'},facts:{'silver.giao_dich_thanh_toan':{label:'Giao dịch thanh toán'}},freshness:{label:'Cập nhật theo đợt',last_sync:'2026-10-21T00:30:00Z'},data_health:{views:{'silver.giao_dich_thanh_toan':{status:healthy?'healthy':'unknown',completeness:healthy?'complete':'unknown',reasons:healthy?[]:['governed_checkpoint_missing'],impacted_metrics:['payment_revenue']}}}};}
async function setup(page:any,canTrigger=true){
 const api=await mockApi(page);api.on('/ai/capabilities',(r:any)=>r.fulfill({json:{...CAPABILITIES,data_coverage:coverage()}}));
 let current:any=null;
 api.on('/system/source-operations',(r:any)=>r.fulfill({json:{configured:true,worker_available:true,worker_phase:'idle',can_trigger:canTrigger,operation:current,total_tables:49,completed_tables:20}}));
 await openAssistant(page);const bar=page.locator('[data-coverage-bar]');return {api,bar,setCurrent:(v:any)=>current=v};
}

test('checking source health refreshes the banner without creating a sync or AI job',async({page})=>{
 const {api,bar}=await setup(page);api.on('/system/sources/check',(r:any)=>r.fulfill({json:{data_coverage:coverage(true)}}));
 await expect(bar).toContainText('1 nguồn chưa có đủ bằng chứng');
 await bar.getByRole('button',{name:'Kiểm tra lại nguồn',exact:true}).click();await expect(bar).toContainText('1/1 nguồn đã khớp');await expect(bar).not.toContainText('1 nguồn chưa có đủ bằng chứng');
 expect(api.calls['/api/system/sources/sync']||[]).toHaveLength(0);expect(api.calls['/api/ai/analysis-jobs']||[]).toHaveLength(0);
});

test('authorized click creates one sync and polls a partial result without marking affected sources healthy',async({page})=>{
 const {api,bar,setCurrent}=await setup(page);const gate=deferred();
 const operation={id:'sync_ui',state:'queued',requested_at:1800000000};
 api.on('/system/sources/sync',async(r:any)=>{await gate.promise;setCurrent({...operation,state:'running'});await r.fulfill({status:202,json:{created:true,operation}});});
 api.on('/system/sources/check',(r:any)=>r.fulfill({json:{data_coverage:coverage(false)}}));
 const button=bar.getByRole('button',{name:'Đồng bộ & đối soát nguồn',exact:true});await expect(button).toBeEnabled();await button.dblclick();expect(api.calls['/api/system/sources/sync']).toHaveLength(1);gate.resolve(null);
 await expect(bar.locator('[data-sync-operation]')).toContainText('Đang chờ worker');
 setCurrent({...operation,state:'partial',finished_at:1800000030,result:{synced_tables:48,total_tables:49,failed_tables:1,duration_seconds:30,failures:[{source:'payment.giao_dich_thanh_toan',code:'TimeoutError'}]}});
 await expect(bar.locator('[data-sync-operation]')).toContainText('48/49 bảng nạp thành công',{timeout:10000});
 await expect.poll(()=>(api.calls['/api/system/sources/check']||[]).length).toBe(1);
 await expect(bar).toContainText('1 nguồn chưa có đủ bằng chứng');expect(api.calls['/api/ai/analysis-jobs']||[]).toHaveLength(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('read-only accounts can check but do not see a sync action',async({page})=>{
 const {bar}=await setup(page,false);await expect(bar.getByRole('button',{name:'Kiểm tra lại nguồn',exact:true})).toBeEnabled();await expect(bar).toContainText('Quyền pipeline.trigger');await expect(bar.getByRole('button',{name:'Đồng bộ & đối soát nguồn',exact:true})).toHaveCount(0);
});
