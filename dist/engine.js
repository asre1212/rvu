export const RULE_VERSION = '2026-work-rvu-v2';
export const LEGACY_RULE_VERSION = '2026-custom-50-v1';
export const SCHEMA_VERSION = 3;
export const STORAGE_KEY = 'rvu-daily-v1';
export const RECOVERY_KEY = 'rvu-daily-before-work-rvu-v2';
export const RATES = Object.freeze({
  colon: { diagnostic: { code: '45378', units: 31800 }, forceps: { code: '45380', units: 34700 }, snare: { code: '45385', units: 44600 }, emr: { code: '45390', units: 58900 } },
  egd: { diagnostic: { code: '43235', units: 20400 }, forceps: { code: '43239', units: 23300 }, snare: { code: '43251', units: 33800 }, emr: { code: '43254', units: 47500 } }
});
export const TECHNIQUES = ['forceps', 'snare', 'emr'];
export const LABELS = { colon: 'Colonoscopy', egd: 'EGD', combo: 'Colon / EGD', diagnostic: 'Diagnostic', forceps: 'Cold forceps biopsy', snare: 'Snare', emr: 'EMR' };
export const formatRVU = units => (Math.round(units / 100) / 100).toFixed(2);
export const validDate = date => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
};
// Selecting multiple techniques is the user's assertion of separate, independently
// reportable lesions/sites. Same-lesion work is entered using only the final technique.
export function sideCalculation(side, selected = []) {
  const keys = [...new Set(selected)];
  if (!RATES[side] || keys.some(k => !TECHNIQUES.includes(k))) throw new Error('Invalid procedure selection.');
  const items = (keys.length ? keys : ['diagnostic']).map(key => ({ key, ...RATES[side][key] }));
  const lines = items.map(item => ({ ...item, factor: 1, creditedUnits: item.units }));
  return { side, lines, units: lines.reduce((n, x) => n + x.creditedUnits, 0) };
}
export function calculate(entry) {
  if (!['colon','egd','combo'].includes(entry.type)) throw new Error('Invalid procedure type.');
  const quantity = entry.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Case counts must be 1–100.');
  const sides = [];
  if (entry.type !== 'egd') sides.push(sideCalculation('colon', entry.lower));
  if (entry.type !== 'colon') sides.push(sideCalculation('egd', entry.upper));
  sides.forEach(s => { s.factor = 1; s.creditedUnits = s.units; });
  const units = sides.reduce((n, s) => n + s.creditedUnits, 0);
  return { sides, units, totalUnits: units * quantity };
}
export function validateEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !/^[\w-]{1,100}$/.test(e.id) || !validDate(e.date) || !['colon','egd','combo'].includes(e.type)) throw new Error('Invalid entry in backup.');
  if (!Number.isInteger(e.quantity) || e.quantity < 1 || e.quantity > 100) throw new Error('Case counts must be 1–100.');
  for (const side of ['lower','upper']) if (!Array.isArray(e[side]) || e[side].length > 3 || e[side].some(k => !TECHNIQUES.includes(k)) || new Set(e[side]).size !== e[side].length) throw new Error('Invalid intervention in backup.');
  if ((e.type === 'colon' && e.upper.length) || (e.type === 'egd' && e.lower.length)) throw new Error('Interventions do not match the procedure.');
  if (![RULE_VERSION,LEGACY_RULE_VERSION].includes(e.ruleVersion)) throw new Error('This backup uses a different calculation rule version.');
  if (typeof e.updatedAt !== 'string' || !Number.isFinite(Date.parse(e.updatedAt))) throw new Error('Invalid entry timestamp.');
  return { id:e.id, date:e.date, type:e.type, lower:[...e.lower], upper:[...e.upper], quantity:e.quantity, ruleVersion:RULE_VERSION, updatedAt:e.updatedAt };
}
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Choose a valid RVU Daily JSON backup.'); }
  if (data?.app !== 'rvu-daily' || ![1,2,SCHEMA_VERSION].includes(data?.schemaVersion) || !Array.isArray(data.entries) || data.entries.length > 50000) throw new Error('This is not a supported RVU Daily backup.');
  const entries = data.entries.map(validateEntry);
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Backup contains duplicate entry IDs.');
  const tombstones = data.tombstones ?? {};
  if (!tombstones || typeof tombstones !== 'object' || Array.isArray(tombstones)) throw new Error('Invalid deleted-entry history.');
  for (const [id, stamp] of Object.entries(tombstones)) if (!/^[\w-]{1,100}$/.test(id) || typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))) throw new Error('Invalid deleted-entry history.');
  const schedules = data.schemaVersion < 3 ? [] : data.schedules;
  const scheduleTombstones = data.schemaVersion < 3 ? {} : data.scheduleTombstones;
  if (!Array.isArray(schedules) || schedules.length > 50000) throw new Error('Invalid daily schedules in backup.');
  const checkedSchedules = schedules.map(validateSchedule);
  if (new Set(checkedSchedules.map(s => s.date)).size !== checkedSchedules.length) throw new Error('Backup contains duplicate schedule dates.');
  if (!scheduleTombstones || typeof scheduleTombstones !== 'object' || Array.isArray(scheduleTombstones)) throw new Error('Invalid deleted-schedule history.');
  for (const [date, stamp] of Object.entries(scheduleTombstones)) if (!validDate(date) || typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))) throw new Error('Invalid deleted-schedule history.');
  return { app:'rvu-daily', schemaVersion:SCHEMA_VERSION, entries, tombstones:{...tombstones}, schedules:checkedSchedules, scheduleTombstones:{...scheduleTombstones} };
}
export function mergeData(current, incoming) {
  const tombstones = Object.assign(Object.create(null), current.tombstones);
  for (const [id, stamp] of Object.entries(incoming.tombstones)) if (!tombstones[id] || Date.parse(stamp) > Date.parse(tombstones[id])) tombstones[id] = stamp;
  const map = new Map(current.entries.map(e => [e.id,e]));
  for (const e of incoming.entries) if (!map.has(e.id) || Date.parse(e.updatedAt) > Date.parse(map.get(e.id).updatedAt)) map.set(e.id,e);
  for (const [id,e] of map) if (tombstones[id] && Date.parse(tombstones[id]) >= Date.parse(e.updatedAt)) map.delete(id);
  const scheduleTombstones = Object.assign(Object.create(null), current.scheduleTombstones);
  for (const [date, stamp] of Object.entries(incoming.scheduleTombstones ?? {})) if (!scheduleTombstones[date] || Date.parse(stamp) > Date.parse(scheduleTombstones[date])) scheduleTombstones[date] = stamp;
  const schedules = new Map((current.schedules ?? []).map(s => [s.date,s]));
  for (const s of incoming.schedules ?? []) if (!schedules.has(s.date) || Date.parse(s.updatedAt) > Date.parse(schedules.get(s.date).updatedAt)) schedules.set(s.date,s);
  for (const [date,s] of schedules) if (scheduleTombstones[date] && Date.parse(scheduleTombstones[date]) >= Date.parse(s.updatedAt)) schedules.delete(date);
  return { app:'rvu-daily', schemaVersion:SCHEMA_VERSION, entries:[...map.values()], tombstones, schedules:[...schedules.values()], scheduleTombstones };
}
export function scheduledProcedures(patients, doubles) {
  if (!Number.isInteger(patients) || patients < 0 || patients > 1000) throw new Error('Scheduled patients must be a whole number from 0 to 1,000.');
  if (!Number.isInteger(doubles) || doubles < 0 || doubles > patients) throw new Error('Doubles must be a whole number between 0 and the scheduled patient count.');
  return patients + doubles;
}
export function validateSchedule(s) {
  if (!s || typeof s !== 'object' || !validDate(s.date) || typeof s.updatedAt !== 'string' || !Number.isFinite(Date.parse(s.updatedAt))) throw new Error('Invalid daily schedule in backup.');
  scheduledProcedures(s.patients,s.doubles);
  return {date:s.date,patients:s.patients,doubles:s.doubles,updatedAt:s.updatedAt};
}
// A double is one encounter with two completed scopes, regardless of technique count.
// Missing schedules are unknown, not zero. Future dates can be excluded by the caller.
export function analyzeActivity(entries, schedules = [], {month = '', through = ''} = {}) {
  const included = date => (!month || date.startsWith(month)) && (!through || date <= through);
  const days = new Map();
  const dayFor = date => {
    if (!days.has(date)) days.set(date,{date,units:0,cases:0,completedProcedures:0,colon:0,egd:0,doubles:0,scheduledPatients:null,scheduledDoubles:null,scheduledProcedures:null});
    return days.get(date);
  };
  for (const s of schedules) if (included(s.date)) {
    const day=dayFor(s.date);
    day.scheduledPatients=s.patients;day.scheduledDoubles=s.doubles;day.scheduledProcedures=scheduledProcedures(s.patients,s.doubles);
  }
  for (const e of entries) if (included(e.date)) {
    const day=dayFor(e.date), n=e.quantity;
    day.cases+=n;day.units+=calculate(e).totalUnits;
    if(e.type!=='egd')day.colon+=n;
    if(e.type!=='colon')day.egd+=n;
    if(e.type==='combo')day.doubles+=n;
    day.completedProcedures+=n*(e.type==='combo'?2:1);
  }
  const rows=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
  const scheduleDays=rows.filter(d=>d.scheduledProcedures!==null).length;
  const totals={cases:0,completedProcedures:0,colon:0,egd:0,doubles:0,scheduledPatients:0,scheduledDoubles:0,scheduledProcedures:0};
  for(const row of rows)for(const key of Object.keys(totals))totals[key]+=row[key]??0;
  const averages={};
  for(const key of Object.keys(totals)){const count=key.startsWith('scheduled')?scheduleDays:rows.length;averages[key]=count?totals[key]/count:null;}
  return {rows,days:rows.length,scheduleDays,totals,averages};
}
export function summarize(entries, month = '') {
  const days = new Map();
  for (const entry of entries) {
    if (month && !entry.date.startsWith(month)) continue;
    const day = days.get(entry.date) ?? { date: entry.date, units: 0, cases: 0, colon: 0, egd: 0, combo: 0 };
    const result = calculate(entry);
    day.units += result.totalUnits;
    day.cases += entry.quantity;
    day[entry.type] += entry.quantity;
    days.set(entry.date, day);
  }
  const rows = [...days.values()].sort((a,b) => b.date.localeCompare(a.date));
  const units = rows.reduce((n,d) => n + d.units, 0);
  return { rows, units, days: rows.length, cases: rows.reduce((n,d) => n + d.cases,0), averageUnits: rows.length ? units / rows.length : 0 };
}

