import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { validateHistoricalEvidenceCandidate } from '../../shared/historicalReportEvidenceCandidate.js';

// Read-only audit: no create/update/delete, report generation, live version pointer or AI calls.
export default async function(req) {
  try {
    const client=createClientFromRequest(req);
    const user=await client.auth.me();
    if (!user) return Response.json({error:'Unauthorized'},{status:401});
    if (user.role!=='admin') return Response.json({error:'Admin-only historical audit'},{status:403});
    const orders={
      '6ac9040e4eb1d249ea0bc045':['tonal-consistency','immersive-layout','bass-output','spatial-resolution','viewing-geometry'],
      '6ac8dcf3c383de099580b031':['dynamic-capability','tonal-consistency','bass-output','immersive-layout','low-frequency-extension','spatial-resolution','viewing-geometry']};
    const input=await req.json();
    const ids=input.snapshot_ids || Object.keys(orders);
    if (!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||ids.some(id=>!orders[id])) return Response.json({error:'Exactly the two approved historical snapshot IDs are required'},{status:400});
    const results=await Promise.all(ids.map(async id=>{
      const snapshot=await client.entities.ReportSnapshot.get(id);
      const page=await client.entities.ProjectAnalysisCache.filter({project_id:snapshot.project_id,version_id:snapshot.version_id},{limit:50});
      if (page.has_more) throw new Error('Ambiguous cache page; audit stopped without writes');
      const fingerprint=snapshot.source_fingerprints.engineeringFingerprint;
      const publications=page.items.filter(row=>row.engineering_publications?.[fingerprint]);
      if (publications.length!==1) throw new Error('Exact pinned publication must resolve once');
      return validateHistoricalEvidenceCandidate(snapshot,publications[0].engineering_publications[fingerprint],orders[id]);
    }));
    return Response.json({dry_run:true,persisted:false,passed:results.every(r=>r.passed),results});
  } catch(error) {
    return Response.json({dry_run:true,persisted:false,error:error.message},{status:409});
  }
}