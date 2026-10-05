// Presentation data only; same row keys as the printed At a Glance authority.
const GLANCE_ROWS = [
  ['system_layout','System layout'], ['screen_size','Screen'], ['seating','Seating'], ['rp23_viewing','Viewing geometry'],
  ['lcr','LCR'], ['surrounds','Surrounds / wides'], ['overheads','Overheads'], ['subwoofers','Subwoofers'],
  ['p12','Screen Dynamic Range / P12'], ['p13','Non-screen Dynamic Range / P13'],
  ['p14','LFE / subwoofer Dynamic Range / P14'], ['p18','Bass extension / P18'],
  ['p19','Bass response at RSP / P19'], ['p20','Bass consistency / P20'],
];
export function buildPreviewAtAGlance(table) {
  const byKey = new Map(table.rows.map(row => [row.key,row]));
  return { columns: table.versions, versionGroups: table.versions.map((version,index) => ({
    version_id:version.version_id, name:version.version_name || version.label,
    cards:GLANCE_ROWS.map(([key,label]) => ({key,label,value:byKey.get(key)?.values?.[index] || null})).filter(card => card.value),
  })) };
}
// Read existing frozen snapshots only. The historical cutoff prevents newer designs
// being substituted when previewing an older comparison. Nothing is recalculated.
export async function readFrozenPreviewSnapshots(readEntities, source, ids) {
  return Promise.all(ids.map(async id => {
    if (source.engineering_snapshot?.identity?.versionId === id) return {
      version_id:id, version_name:source.engineering_snapshot.version?.name,
      snapshot:source.engineering_snapshot, source_record_id:source.id,
    };
    const page = await readEntities.Proposal.filter({ project_id:source.project_id,account_id:source.account_id,
      version_id:id,proposal_type:'system_summary',created_date:{$lte:source.created_date} }, {sort:'-created_date',limit:1});
    const frozen = page.items?.[0];
    return {version_id:id,version_name:frozen?.engineering_snapshot?.version?.name,snapshot:frozen?.engineering_snapshot || null,source_record_id:frozen?.id || null};
  }));
}