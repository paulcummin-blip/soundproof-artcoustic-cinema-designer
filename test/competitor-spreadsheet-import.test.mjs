import test from 'node:test';
import assert from 'node:assert/strict';
import { planCompetitorImport, applyCompetitorImport, selectComparisonLibraryRows, comparisonDataQuality } from '../src/components/utils/spl/competitorSpreadsheetImport.js';
const row = { manufacturer: 'M&K Sound', model: 'M50', sensitivity_value_db:85, sensitivity_reference:'2.83V/1m', rated_impedance_ohm:4, continuous_power_w:50, power_rating_type:'Rated IEC', source_url:'https://www.mksound.com/products/m-series/m50/', p12_p13_eligible:true, data_confidence:'B' };
const preview = record => [{record, rowNumber:2,warnings:[]}];
test('re-upload updates aliases in place, preserves unrelated rows and clears old derived provenance', async()=>{
 const records=[{...row,id:'mk50',manufacturer:'MK Sound',publish_source:'speaker_database',secondary_evidence:{url:'old'}},{id:'other',manufacturer:'Other',model:'A'}];
 const entity={update:async(id,v)=>Object.assign(records.find(r=>r.id===id),v),create:async v=>records.push({...v,id:'new'})};
 let plan=planCompetitorImport(preview({...row,sensitivity_value_db:86}),records);
 assert.equal(plan[0].action,'Update');
 assert.equal(plan[0].existingId,'mk50');
 await applyCompetitorImport(plan,entity,'now');
 await applyCompetitorImport(planCompetitorImport(preview(row),records),entity,'later');
 assert.equal(records.length,2);
 assert.equal(records[0].sensitivity_value_db,85);
 assert.equal(records[0].secondary_evidence,null);
 assert.equal(records[0].publish_source,'spreadsheet');
 assert.deepEqual(records[1],{id:'other',manufacturer:'Other',model:'A'});
 assert.equal(selectComparisonLibraryRows(records).length,1);
});
test('duplicate file identities fail before any writes',()=>{
 assert.throws(()=>planCompetitorImport([...preview(row),...preview({...row,manufacturer:'MK Sound'})],[]),/Duplicate/);
 assert.throws(()=>planCompetitorImport(preview(row),[{...row,id:'a'},{...row,id:'b'}]),/Multiple stored/);
 assert.throws(()=>planCompetitorImport(preview({...row,manufacturer:'Artcoustic'}),[]),/registry/);
});
test('new records are added; incomplete rows retain warnings and do not gain a grade',async()=>{
 const records=[];const entity={create:async v=>records.push(v)};
 const input={record:{manufacturer:'M&K Sound',model:'S-150 mkII',p12_p13_eligible:false},rowNumber:2,warnings:['Missing sensitivity']};
 const plan=planCompetitorImport([input],[]);
 assert.equal(plan[0].warnings[0],'Missing sensitivity');
 await applyCompetitorImport(plan,entity,'now');
 assert.equal(records[0].p12_p13_eligible,false);
 assert.equal(comparisonDataQuality(records[0]),'Limited Data');
});
test('only explicit published rows appear; Excel wins over matching database snapshot',()=>{
 const rows=[{...row,id:'legacy'}, {...row,id:'db',publish_source:'speaker_database',published:true}, {...row,id:'excel',publish_source:'spreadsheet',published:true},{...row,model:'Hidden',publish_source:'spreadsheet',published:true,active:false}];
 assert.deepEqual(selectComparisonLibraryRows(rows).map(r=>r.id),['excel']);
});
test('quality distinguishes measured/rated evidence from amp recommendation or missing sources',()=>{
 assert.equal(comparisonDataQuality(row),'Good Data');
 assert.equal(comparisonDataQuality({...row,source_url:''}),'Limited Data');
 assert.equal(comparisonDataQuality({...row,continuous_power_w:null,recommended_amp_max_w:125}),'Limited Data');
 assert.equal(comparisonDataQuality({...row,sensitivity_reference:''}),'Limited Data');
 assert.equal(comparisonDataQuality({...row,continuous_power_w:500,power_rating_type:'Peak'}),'Limited Data');
});
