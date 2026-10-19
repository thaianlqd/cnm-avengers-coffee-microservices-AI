import {useEffect,useRef} from 'react';
import {accountStorageKey,getAccountIdentity} from '../utils/authSession.mjs';
import {jobStorageKey} from '../utils/analysisJobs.mjs';

/** One epoch/controller owner shared by proposal/generation/refinement/Scan.
 * Existing job protocol and presentation state stay with their current owners.
 */
export function useAnalysisLifecycle() {
  const accountJobStorageKey=useRef(accountStorageKey(jobStorageKey,getAccountIdentity())).current;
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
  useEffect(()=>()=>{invalidate();planningInFlight.current=false;refinementInFlight.current=false;},[]);
  return {accountJobStorageKey,planningInFlight,refinementInFlight,pendingJob,jobController,jobEpoch,
    reportIdentityRef,beginRequest,invalidate};
}
