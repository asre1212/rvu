import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,sideCalculation,summarize,parseBackup,mergeData,RULE_VERSION,LEGACY_RULE_VERSION,SCHEMA_VERSION,validDate,formatRVU} from '../dist/engine.js';
const entry=(changes={})=>({id:'test-1',date:'2026-11-01',type:'colon',lower:[],upper:[],quantity:1,ruleVersion:RULE_VERSION,updatedAt:'2026-11-01T18:00:00Z',...changes});
const backup=entries=>({app:'rvu-daily',schemaVersion:SCHEMA_VERSION,entries,tombstones:{}});
test('eight 2026 work values; therapeutic code includes diagnostic work',()=>{
  const lower=[31800,34700,44600,58900],upper=[20400,23300,33800,47500];
  for(const [i,tech] of [null,'forceps','snare','emr'].entries()){
    assert.equal(calculate(entry({lower:tech?[tech]:[]})).units,lower[i]);
    assert.equal(calculate(entry({type:'egd',upper:tech?[tech]:[]})).units,upper[i]);
  }
});
test('selecting biopsy and snare means separate lesions, full credit, no extra fields',()=>{
  for(const selected of [['forceps','snare'],['snare','forceps']]){
    assert.equal(calculate(entry({lower:selected})).units,79300);
    assert.equal(calculate(entry({type:'egd',upper:selected})).units,57100);
    assert.deepEqual(parseBackup(JSON.stringify(backup([entry({lower:selected})]))).entries[0],entry({lower:selected}));
  }
});
test('EMR with additional selected techniques counts full values for separate lesions',()=>{
  assert.equal(calculate(entry({lower:['emr','forceps']})).units,93600);
  assert.equal(calculate(entry({lower:['emr','snare']})).units,103500);
  assert.equal(calculate(entry({lower:['emr','snare','forceps']})).units,138200);
  assert.equal(calculate(entry({type:'egd',upper:['emr','forceps']})).units,70800);
  assert.equal(calculate(entry({type:'egd',upper:['emr','snare']})).units,81300);
  assert.equal(calculate(entry({type:'egd',upper:['emr','snare','forceps']})).units,104600);
});
test('same-lesion work is entered using only the final technique',()=>{
  assert.equal(calculate(entry({lower:['snare']})).units,44600);
  assert.equal(calculate(entry({lower:['emr']})).units,58900);
  assert.equal(calculate(entry({type:'egd',upper:['emr']})).units,47500);
});
test('combined scopes add in full even when upper value is higher',()=>{
  assert.equal(calculate(entry({type:'combo'})).units,52200);
  assert.equal(calculate(entry({type:'combo',lower:['forceps'],upper:['forceps']})).units,58000);
  assert.equal(calculate(entry({type:'combo',upper:['emr']})).units,79300);
  assert.equal(calculate(entry({type:'combo',lower:['forceps','snare'],upper:['forceps']})).units,102600);
  assert.equal(calculate(entry({type:'combo',lower:['emr','forceps','snare'],upper:['emr','forceps','snare']})).units,242800);
});
test('upper and lower technique selections remain independent',()=>{
  assert.equal(calculate(entry({type:'combo',lower:['snare'],upper:['forceps']})).units,67900);
  assert.equal(calculate(entry({type:'combo',lower:['forceps'],upper:['snare']})).units,68500);
});
test('repeated techniques count one code per scope, never one per lesion',()=>{
  assert.equal(sideCalculation('colon',['snare','snare']).units,44600);
  assert.equal(sideCalculation('egd',['forceps','forceps']).units,23300);
});
test('quantity counts encounters with exact precision',()=>{
  const e=entry({type:'combo',lower:['forceps'],upper:['forceps'],quantity:3});
  assert.equal(calculate(e).totalUnits,174000);assert.equal(formatRVU(calculate(e).totalUnits),'17.40');
  assert.equal(summarize([e,entry({id:'other',lower:['snare']})]).units,218600);assert.equal(summarize([e]).cases,3);
});
test('averages use only distinct dates with entries and exclude emptied dates',()=>{
  const entries=[entry({quantity:3}),entry({id:'second',date:'2026-11-28'}),entry({id:'third',date:'2026-12-01',type:'egd'})];
  const nov=summarize(entries,'2026-11');assert.equal(nov.days,2);assert.equal(nov.cases,4);assert.equal(nov.averageUnits,63600);
  assert.equal(summarize(entries).days,3);assert.equal(summarize(entries,'2027-01').averageUnits,0);
  assert.equal(summarize(entries.filter(e=>e.date!=='2026-11-28'),'2026-11').days,1);
});
test('legacy backups recalculate all techniques without losing records',()=>{
  const old=[entry({ruleVersion:LEGACY_RULE_VERSION,type:'combo',lower:['forceps'],upper:['forceps']}),entry({id:'multi',ruleVersion:LEGACY_RULE_VERSION,lower:['forceps','snare'],quantity:2})];
  const source={...backup(old),schemaVersion:1,tombstones:{deleted:'2026-11-01T19:00:00Z'}};
  const snapshot=JSON.stringify(source),migrated=parseBackup(snapshot);assert.equal(JSON.stringify(source),snapshot);assert.equal(migrated.schemaVersion,2);assert.deepEqual(migrated.tombstones,source.tombstones);
  for(let i=0;i<old.length;i++)for(const k of ['id','date','type','lower','upper','quantity','updatedAt'])assert.deepEqual(migrated.entries[i][k],old[i][k]);
  assert.equal(calculate(migrated.entries[0]).units,58000);assert.equal(calculate(migrated.entries[1]).units,79300);
  assert.equal(summarize(migrated.entries).units,216600);assert.deepEqual(parseBackup(JSON.stringify(migrated)),migrated);
});
test('newer edits win over older backup imports',()=>{
  const legacy=parseBackup(JSON.stringify({app:'rvu-daily',schemaVersion:1,entries:[entry({ruleVersion:LEGACY_RULE_VERSION,lower:['forceps','snare']})]}));
  const revised=entry({lower:['snare'],updatedAt:'2026-11-02T18:00:00Z'});
  const merged=mergeData(backup([revised]),legacy);assert.equal(merged.entries.length,1);assert.equal(calculate(merged.entries[0]).units,44600);
});
test('JSON round trip, duplicate import, edits, tombstones and undo',()=>{
  const current=backup([entry()]);assert.deepEqual(parseBackup(JSON.stringify(current)),current);assert.equal(mergeData(current,current).entries.length,1);
  const revised=entry({quantity:2,updatedAt:'2026-11-02T18:00:00Z'});assert.equal(mergeData(current,backup([revised])).entries[0].quantity,2);
  const deleted={...backup([]),tombstones:{'test-1':'2026-11-03T18:00:00Z'}};assert.equal(mergeData(deleted,backup([revised])).entries.length,0);
  assert.equal(mergeData(deleted,backup([entry({updatedAt:'2026-11-04T18:00:00Z'})])).entries.length,1);
});
test('malformed backups rejected atomically',()=>{
  for(const patch of [{quantity:0},{quantity:1.5},{quantity:101},{date:'2026-02-30'},{lower:['unknown']},{lower:['forceps','forceps']},{type:'colon',upper:['forceps']},{ruleVersion:'unknown'}])assert.throws(()=>parseBackup(JSON.stringify(backup([entry(patch)]))));
  assert.throws(()=>parseBackup(JSON.stringify(backup([entry(),entry()]))));assert.throws(()=>parseBackup('bad json'));
  assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2028-02-29'),true);
});
