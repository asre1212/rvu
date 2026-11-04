import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,calculateCMSStyle,summarizeCMSStyle} from '../dist/engine.js';
const e=(x={})=>({date:'2026-11-01',type:'colon',lower:[],upper:[],quantity:1,...x});
test('snare plus forceps subtracts one diagnostic base without altering full value',()=>{
 const x=e({lower:['snare','forceps']});assert.equal(calculateCMSStyle(x).units,47500);assert.equal(calculate(x).units,79300);
 assert.equal(calculateCMSStyle(e({lower:['forceps','snare','forceps']})).units,47500);
});
test('single scopes are unchanged and three separate techniques deduct two bases',()=>{
 for(const type of ['colon','egd'])for(const techniques of [[],['forceps'],['snare'],['emr']]){const x=e({type,lower:type==='colon'?techniques:[],upper:type==='egd'?techniques:[]});assert.equal(calculateCMSStyle(x).units,calculate(x).units);}
 assert.equal(calculateCMSStyle(e({lower:['emr','snare','forceps']})).units,74600);
});
test('family reductions precede cross-family 50 percent; higher EGD can be primary',()=>{
 assert.equal(calculateCMSStyle(e({type:'combo'})).units,42000);
 assert.equal(calculateCMSStyle(e({type:'combo',lower:['snare','forceps'],upper:['snare','forceps']})).units,65850);
 assert.equal(calculateCMSStyle(e({type:'combo',upper:['emr']})).units,63400);
});
test('patients never reduce each other, quantity and period use identical completed-day basis',()=>{
 const x=e({lower:['snare','forceps'],quantity:3});assert.equal(calculateCMSStyle(x).totalUnits,142500);
 const y=e({date:'2026-11-02'}),z=e({date:'2026-10-01'});
 assert.deepEqual(summarizeCMSStyle([x,y,z],'2026-11'),{units:174300,days:2,averageUnits:87150});
 assert.deepEqual(summarizeCMSStyle([]),{units:0,days:0,averageUnits:0});
});
