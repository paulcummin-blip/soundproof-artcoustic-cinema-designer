import {useEffect} from 'react';
import {reportFailureCode} from './reportFailureSignal';
import {reportClientFailure} from './clientExperienceMonitor';
export default function useReportFailureMonitoring({projectId,versionId,reportType,loading,readFailed,blocked,hasSavedEvidence}) {
 const code=reportFailureCode({loading,readFailed,blocked,hasSavedEvidence});
 useEffect(()=>{
  if(!projectId || !versionId || !code)return;
  // Allow normal hydration/publication handoff to settle. The shared queue
  // retains identity and retries delivery if the connection is unavailable.
  const timer=setTimeout(()=>reportClientFailure({code,operation:'report-readiness',projectId,versionId,reportType}),1500);
  return()=>clearTimeout(timer);
 },[projectId,versionId,reportType,code]);
}
