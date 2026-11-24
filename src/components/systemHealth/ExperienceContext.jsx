import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {useAuth} from '@/lib/AuthContext';
import {useCanonicalProject} from '@/components/state/projectHydrationStore';
import {setExperienceContext,reportClientFailure,flushExperienceIncidents} from './clientExperienceMonitor';
export default function ExperienceContext(){
 const location=useLocation(), {user,authError}=useAuth(), project=useCanonicalProject();
 // Context only: never send names, search strings, credentials or form data.
 useEffect(()=>{
  const p=new URLSearchParams(location.search);
  const scoped=/^\/(RoomDesigner|RP22Report|RP22ClientReport|DesignReview|ProjectProposalAssets|ProposalCentre|ProposalEditor|proposal)(\/|$)/.test(location.pathname);
  setExperienceContext({userId:user?.id||null,pagePath:location.pathname,
   projectId:scoped?(p.get('project')||p.get('projectId')||project.projectId):null,
   versionId:scoped?(p.get('version')||p.get('versionId')||project.identity?.activeVersionId):null});
  void flushExperienceIncidents();
 },[user?.id,location.pathname,location.search,project.projectId,project.identity?.activeVersionId]);
 useEffect(()=>{
  if(authError&&!['user_not_registered','account_suspended','account_not_activated','account_expired','access_denied','auth_required'].includes(authError.type))
   reportClientFailure({code:'DATA_REQUEST_FAILED',operation:'login-verification',detail:'Unexpected account verification failure.'});
 },[authError]);
 return null;
}
