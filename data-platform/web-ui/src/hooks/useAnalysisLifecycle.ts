import {useEffect,useRef} from 'react';
import {accountStorageKey,getAccountIdentity} from '../utils/authSession.mjs';
import {jobStorageKey,runAnalysisJob,cancelAnalysisJob} from '../utils/analysisJobs.mjs';

/** One epoch/controller owner shared by proposal/generation/refinement/Scan.
 * Existing job protocol and presentation state stay with their current owners.
 */
export function useAnalysisLifecycle(scope = 'analysis') {
  const accountJobStorageKey=useRef(accountStorageKey(scope === 'analysis' ? jobStorageKey : jobStorageKey+'.'+scope,getAccountIdentity())).current;
  const planningInFlight=useRef(false);
  const refinementInFlight=useRef(false);
  const pendingJob=useRef<any>(null);
  const jobController=useRef<AbortController|null>(null);
  const jobEpoch=useRef(0);
  const reportIdentityRef=useRef<string|null>(null);
  const beginRequest=()=>{
    const epoch=++jobEpoch.current;
    jobController.current?.abort();
    const controller=new AbortController();
    jobController.current=controller;
    return {epoch,signal:controller.signal,current:()=>epoch===jobEpoch.current&&!controller.signal.aborted};
  };
  const invalidate=()=>{jobEpoch.current++;jobController.current?.abort();};
  const clearJob=()=>{pendingJob.current=null;sessionStorage.removeItem(accountJobStorageKey);};
  const cancelOwnedJob=()=>{
    invalidate();
    cancelAnalysisJob(pendingJob.current).catch(()=>{});
    try {clearJob();} catch { /* Unknown storage cannot authorize replay. */ }
    planningInFlight.current=false;refinementInFlight.current=false;
  };
  const executeJob=(record:any,ticket:ReturnType<typeof beginRequest>,onUpdate:(job:any)=>void=()=>{})=>
    runAnalysisJob(record,{signal:ticket.signal,
      onUpdate:job=>{if(ticket.current())onUpdate(job);},
      onCheckpoint:value=>{if(ticket.current()){
        pendingJob.current=value;sessionStorage.setItem(accountJobStorageKey,JSON.stringify(value));
      }}});
  useEffect(()=>()=>{invalidate();planningInFlight.current=false;refinementInFlight.current=false;},[]);
  return {accountJobStorageKey,planningInFlight,refinementInFlight,pendingJob,jobController,jobEpoch,
    reportIdentityRef,beginRequest,invalidate,executeJob,clearJob,cancelOwnedJob};
}
