import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, summarize, parseBackup, mergeData, RULE_VERSION, validDate, formatRVU } from '../dist/engine.js';
const entry=(changes={})=>({id:'test-1',date:'2026-11-01',type:'colon',lower:[],upper:[],quantity:1,ruleVersion:RULE_VERSION,updatedAt:'2026-11-01T18:00:00Z',...changes});
const backup=entries=>({app:'rvu-daily',schemaVersion:1,entries,tombstones:{}});
test('diagnostic rates, biopsy, snare, EMR on both sides',()=>{
  const lower=[31800,34700,44600,58900],upper=[20400,23300,33800,47500];
  for(const [i,tech] of [null,'forceps','snare','emr'].entries()){
    assert.equal(calculate(entry({lower:tech?[tech]:[]})).units,lower[i]);
    assert.equal(calculate(entry({type:'egd',upper:tech?[tech]:[]})).units,upper[i]);
  }
});
test('forceps with snare is half of full forceps value, independent of order',()=>{
  for(const lower of [['forceps','snare'],['snare','forceps']])assert.equal(calculate(entry({lower})).units,61950);
  assert.equal(calculate(entry({type:'egd',upper:['forceps','snare']})).units,45450);
});
test('EMR with distinct additional techniques uses highest full, others half',()=>{
  assert.equal(calculate(entry({lower:['emr','snare','forceps']})).units,98550);
});
test('combo sides are independent; lower subtotal halved after side calculation',()=>{
  assert.equal(calculate(entry({type:'combo'})).units,42000);
  assert.equal(calculate(entry({type:'combo',lower:['forceps'],upper:['forceps']})).units,46350);
  assert.equal(calculate(entry({type:'combo',lower:['forceps','snare'],upper:['forceps']})).units,73600);
  // Upper EMR can be the higher side. Do not always halve upper.
  assert.equal(calculate(entry({type:'combo',upper:['emr']})).units,63400);
  // Quarter-credit fractions retain full precision.
  assert.equal(calculate(entry({type:'combo',lower:['emr'],upper:['snare','forceps']})).units,81625);
});
test('quantity and daily totals retain precision',()=>{
  assert.equal(formatRVU(82350),'8.24');
  const entries=[entry({id:'plain',quantity:2}),entry({id:'bx',quantity:4,lower:['forceps']}),entry({id:'snare',quantity:2,lower:['snare']}),entry({id:'both',quantity:2,lower:['snare','forceps']}),entry({id:'upper',type:'egd',quantity:4})];
  assert.equal(summarize(entries).units,497100);
  assert.equal(summarize(entries).cases,14);
});
test('averages include only distinct dates with saved entries, not calendar gaps or case count',()=>{
  const entries=[entry({quantity:3}),entry({id:'second',date:'2026-11-28'}),entry({id:'third',date:'2026-12-01',type:'egd'})];
  const nov=summarize(entries,'2026-11');assert.equal(nov.days,2);assert.equal(nov.cases,4);assert.equal(nov.averageUnits,63600);
  assert.equal(summarize(entries).days,3);assert.equal(summarize(entries,'2027-01').days,0);
  assert.equal(summarize(entries.filter(e=>e.date!=='2026-11-28'),'2026-11').days,1);
});
test('backup round trip, duplicate import, newer edits, deletion, undo',()=>{
  const current=backup([entry()]);assert.deepEqual(parseBackup(JSON.stringify(current)),current);
  assert.equal(mergeData(current,current).entries.length,1);
  const revised=entry({quantity:2,updatedAt:'2026-11-02T18:00:00Z'});assert.equal(mergeData(current,backup([revised])).entries[0].quantity,2);
  const deleted={...backup([]),tombstones:{'test-1':'2026-11-03T18:00:00Z'}};assert.equal(mergeData(deleted,backup([revised])).entries.length,0);
  assert.equal(mergeData(deleted,backup([entry({updatedAt:'2026-11-04T18:00:00Z'})])).entries.length,1);
});
test('malformed data rejected atomically',()=>{
  for(const patch of [{quantity:0},{quantity:1.5},{date:'2026-02-30'},{lower:['unknown']},{lower:['forceps','forceps']},{type:'colon',upper:['forceps']},{ruleVersion:'unknown'}])assert.throws(()=>parseBackup(JSON.stringify(backup([entry(patch)]))));
  assert.throws(()=>parseBackup(JSON.stringify(backup([entry(),entry()]))));assert.throws(()=>parseBackup('bad json'));
  assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2028-02-29'),true);
});
