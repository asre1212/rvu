import { RATES, RULE_VERSION, SCHEMA_VERSION, STORAGE_KEY, RECOVERY_KEY, TECHNIQUES, LABELS, validateEntry, validateSchedule, scheduledProcedures, analyzeActivity, calculate, formatRVU, parseBackup, mergeData, summarize, summarizeCMSStyle, validDate, paymentRows, validatePayment } from './engine.js';
const $ = id => document.getElementById(id);
const dollars = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateLabel = (date, options) => new Date(date+'T12:00:00').toLocaleDateString('en-US',options);
const emptyData = () => ({ app:'rvu-daily',schemaVersion:SCHEMA_VERSION,entries:[],tombstones:{},schedules:[],scheduleTombstones:{},payments:[] });
const blankDraft = type => ({type,lower:[],upper:[],quantity:1});
const newId = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
let data = emptyData(), selectedDate = localDate(), month = selectedDate.slice(0,7), tab = 'journal';
let draft = blankDraft('colon'), editId = null, dirty = false, pendingImport = null;
let paymentDirty = false;
let scheduleDirty = false, scheduleDate = null;
let blockedStorage = false, rawStorage = null, waitingWorker = null, swRegistration = null, reloading = false, reloadNeeded = false, hadController = !!navigator.serviceWorker?.controller, installPrompt = null;
let toastTimer, undoAction;
function storageWarning(text) { $('storage-warning').textContent = text; $('storage-warning').hidden = false; }
try {
  rawStorage = localStorage.getItem(STORAGE_KEY);
  if (rawStorage) {
    data = parseBackup(rawStorage);
    if (JSON.parse(rawStorage).schemaVersion !== SCHEMA_VERSION) {
      if (!localStorage.getItem(RECOVERY_KEY)) localStorage.setItem(RECOVERY_KEY,rawStorage);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    }
  }
  $('export-original').hidden=!localStorage.getItem(RECOVERY_KEY);
}
catch { blockedStorage = true; storageWarning('Saved data could not be read. It has not been overwritten. Export a recovery copy from Rules & backup before clearing website data.'); }
function toast(message, undo = null) {
  clearTimeout(toastTimer); $('toast-text').textContent=message; $('toast').hidden=false; undoAction=undo; $('toast-undo').hidden=!undo;
  toastTimer=setTimeout(()=>{ $('toast').hidden=true; undoAction=null; },undo?10000:4500);
}
$('toast-undo').addEventListener('click',()=>{ const action=undoAction; $('toast').hidden=true; undoAction=null; action?.(); });
function timestamp() {
  const stamps = [...data.payments.map(p=>p.updatedAt),...data.entries.map(e=>e.updatedAt),...data.schedules.map(s=>s.updatedAt),...Object.values(data.tombstones),...Object.values(data.scheduleTombstones)];
  const latest = stamps.reduce((n,s)=>Math.max(n,Date.parse(s)),0);
  return new Date(Math.max(Date.now(),latest+1)).toISOString();
}
function saveData(next) {
  if (blockedStorage) { toast('Storage is unavailable. Export a recovery copy first.'); return false; }
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const merged = current ? mergeData(parseBackup(current),next) : next;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(merged));
    data=merged; $('storage-warning').hidden=true; render(); return true;
  } catch (e) { storageWarning('Could not save this change. Your previous entries are intact. Export a backup and check available device storage.'); toast('Entry was not saved.'); return false; }
}
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY)return;
  try { data=event.newValue?parseBackup(event.newValue):emptyData(); render(); } catch { storageWarning('Another tab changed stored data to an unreadable format. Export a backup before continuing.'); blockedStorage=true; }
});
function monthLabel() { return dateLabel(month+'-01',{month:'long',year:'numeric'}); }
function setTab(next) {
  tab=next; $('journal-view').hidden=next!=='journal'; $('averages-view').hidden=next!=='averages'; $('payments-view').hidden=next!=='payments';
  for(const kind of ['journal','averages','payments']) { const button=$(kind+'-tab'); button.classList.toggle('active',kind===next); if(kind===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); }
  renderAverages();renderPayments();
}
$('journal-tab').addEventListener('click',()=>setTab('journal'));
$('averages-tab').addEventListener('click',()=>setTab('averages'));
$('payments-tab').addEventListener('click',()=>setTab('payments'));
function pickDate(date) {
  if(!validDate(date))return false;
  if((editId||scheduleDirty) && date!==selectedDate && !confirm('Discard the unsaved edit or schedule and change day?')){ $('entry-date').value=selectedDate; return false; }
  if(editId && date!==selectedDate) resetDraft();
  if(date!==selectedDate)scheduleDirty=false;
  selectedDate=date; month=date.slice(0,7); render();return true;
}
$('entry-date').addEventListener('change',e=>pickDate(e.target.value));
for(const [id,delta] of [['previous-month',-1],['next-month',1]])$(id).addEventListener('click',()=>{
  const d = new Date(month+'-15T12:00:00');d.setMonth(d.getMonth()+delta);month=localDate(d).slice(0,7);renderCalendar();renderDaily();renderAverages();
});
$('today-button').addEventListener('click',()=>pickDate(localDate()));
function renderCalendar() {
  $('month-label').textContent=monthLabel();
  const first=new Date(month+'-01T12:00:00'), length=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  const totals=new Map(analyzeActivity(data.entries,data.schedules,{month}).rows.map(row=>[row.date,row]));
  const container=$('calendar');container.replaceChildren();
  for(let i=0;i<first.getDay();i++)container.append(document.createElement('span'));
  for(let day=1;day<=length;day++) {
    const date=`${month}-${String(day).padStart(2,'0')}`, row=totals.get(date), button=document.createElement('button');
    button.type='button';button.className='calendar-day'+(row?' has-entries':'')+(date===selectedDate?' selected':'')+(date===localDate()?' today':'');
    button.setAttribute('aria-label',`${dateLabel(date,{month:'long',day:'numeric',year:'numeric'})}${row?`, ${row.completedProcedures} completed procedures, ${formatRVU(row.units)} wRVUs${row.scheduledProcedures!==null?`, ${row.scheduledProcedures} scheduled procedures`:''}`:`, no entries`}`);
    button.setAttribute('aria-pressed',String(date===selectedDate));
    const n=document.createElement('span');n.textContent=day;button.append(n);
    if(row){const value=document.createElement('small');value.textContent=row.cases?formatRVU(row.units):`${row.scheduledProcedures} sched.`;button.append(value);}
    button.addEventListener('click',()=>pickDate(date));container.append(button);
  }
}
function scheduleInput() {
  if($('scheduled-patients').value.trim()===''||$('scheduled-doubles').value.trim()==='')throw new Error('Enter scheduled patients and doubles (0 if none).');
  const patients=Number($('scheduled-patients').value),doubles=Number($('scheduled-doubles').value);
  return {patients,doubles,procedures:scheduledProcedures(patients,doubles)};
}
function renderScheduleCalculation() {
  let valid=false;
  try {
    const s=scheduleInput();valid=true;
    $('scheduled-total').textContent=s.procedures;
    $('schedule-equation').textContent=`${s.patients} patients + ${s.doubles} doubles = ${s.procedures} procedures`;
    $('schedule-error').textContent='';
  } catch(error) {
    $('scheduled-total').textContent='—';$('schedule-equation').textContent='A double is one patient having an EGD + colonoscopy.';
    $('schedule-error').textContent=scheduleDirty?error.message:'';
  }
  $('save-schedule').disabled=!valid||blockedStorage||!scheduleDirty;
}
function renderSchedule() {
  const s=data.schedules.find(s=>s.date===selectedDate);
  if(!scheduleDirty||scheduleDate!==selectedDate){
    $('scheduled-patients').value=s?s.patients:'';$('scheduled-doubles').value=s?s.doubles:0;scheduleDate=selectedDate;
  }
  $('clear-schedule').hidden=!s;$('clear-schedule').disabled=blockedStorage;
  $('schedule-save-status').textContent=scheduleDirty?'Unsaved changes':s?'Saved for this day':'No schedule saved';
  const activity=analyzeActivity(data.entries.filter(e=>e.date===selectedDate));
  $('completed-day-total').textContent=activity.totals.completedProcedures;
  renderScheduleCalculation();
}
for(const id of ['scheduled-patients','scheduled-doubles'])$(id).addEventListener('input',()=>{scheduleDirty=true;renderSchedule();});
$('schedule-form').addEventListener('submit',event=>{
  event.preventDefault();
  let s;try{const values=scheduleInput();s=validateSchedule({date:selectedDate,patients:values.patients,doubles:values.doubles,updatedAt:timestamp()});}catch(error){$('schedule-error').textContent=error.message;return;}
  const next={...data,schedules:[...data.schedules.filter(x=>x.date!==selectedDate),s],scheduleTombstones:{...data.scheduleTombstones}};
  delete next.scheduleTombstones[selectedDate];
  if(saveData(next)){scheduleDirty=false;renderSchedule();toast('Daily schedule saved.');considerUpdate();}
});
$('clear-schedule').addEventListener('click',()=>{
  const saved=data.schedules.find(s=>s.date===selectedDate);if(!saved)return;
  const next={...data,schedules:data.schedules.filter(s=>s.date!==selectedDate),scheduleTombstones:{...data.scheduleTombstones,[selectedDate]:timestamp()}};
  if(saveData(next)){
    scheduleDirty=false;renderSchedule();
    toast('Schedule cleared. Completed cases kept.',()=>{
      const restored={...saved,updatedAt:timestamp()},next={...data,schedules:[...data.schedules.filter(s=>s.date!==saved.date),restored],scheduleTombstones:{...data.scheduleTombstones}};
      delete next.scheduleTombstones[saved.date];if(saveData(next))toast('Schedule restored.');
    });considerUpdate();
  }
});
function resetDraft() { draft=blankDraft(draft.type);editId=null;dirty=false;renderForm();considerUpdate(); }
document.querySelectorAll('[data-type]').forEach(button=>button.addEventListener('click',()=>{
  draft.type=button.dataset.type;
  if(draft.type==='colon')draft.upper=[];if(draft.type==='egd')draft.lower=[];
  dirty=true;renderForm();
}));
document.querySelectorAll('[data-tech]').forEach(button=>button.addEventListener('click',()=>{
  const {side,tech}=button.dataset;draft[side]=draft[side].includes(tech)?draft[side].filter(k=>k!==tech):[...draft[side],tech];
  dirty=true;renderForm();
}));
function quantityChange(value) { draft.quantity=value;dirty=true;renderCalculation(); }
$('quantity').addEventListener('input',e=>quantityChange(Number(e.target.value)));
for(const [id,delta] of [['quantity-minus',-1],['quantity-plus',1]])$(id).addEventListener('click',()=>{
  const n=Math.min(100,Math.max(1,(Number.isInteger(draft.quantity)?draft.quantity:1)+delta));$('quantity').value=n;quantityChange(n);
});
function renderForm() {
  $('form-title').textContent=editId?'Edit entry':'Add a case';$('cancel-edit').hidden=!editId;
  $('save-entry').textContent=editId?'Save changes':'+ Add case';
  document.querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===draft.type)));
  document.querySelectorAll('[data-tech]').forEach(b=>b.setAttribute('aria-pressed',String(draft[b.dataset.side].includes(b.dataset.tech))));
  $('lower-field').hidden=draft.type==='egd';$('upper-field').hidden=draft.type==='colon';$('quantity').value=draft.quantity;
  const multiple=draft.lower.length>1||draft.upper.length>1;
  $('selection-hint').textContent=multiple?'Multiple techniques = separate lesions/sites. Each selected code counts once at full work RVUs.':'No selection = diagnostic. Same lesion: select only the final technique. Cases means patients, not polyps.';
  renderCalculation();
}
function renderCalculation() {
  const valid=Number.isInteger(draft.quantity)&&draft.quantity>=1&&draft.quantity<=100;
  $('quantity-minus').disabled=draft.quantity<=1;$('quantity-plus').disabled=draft.quantity>=100;
  const result=calculate({...draft,quantity:valid?draft.quantity:1});
  $('save-entry').disabled=!valid||blockedStorage;
  $('preview-total').replaceChildren();const text=document.createTextNode(valid?formatRVU(result.totalUnits):'—');const small=document.createElement('small');small.textContent='wRVUs';$('preview-total').append(text,small);
  const lines=$('calculation-lines');lines.replaceChildren();
  for(const side of result.sides){
    const p=document.createElement('p');p.textContent=`${LABELS[side.side]}: `+side.lines.map(l=>`${l.code} ${LABELS[l.key]} ${formatRVU(l.units)}`).join(' + ')+` = ${formatRVU(side.units)} wRVUs`;
    lines.append(p);
    if(side.lines.length>1){const p=document.createElement('p');p.textContent='Separate lesions/sites assumed. Additional codes may require modifier 59/XS; this does not reduce their published work RVUs.';lines.append(p);}
  }
  if(result.sides.length>1){const p=document.createElement('p');p.textContent='Upper + lower work RVUs are added in full. No multiple-procedure payment reduction.';lines.append(p);}
  if(valid&&draft.quantity>1){const p=document.createElement('p');p.textContent=`${draft.quantity} identical cases × ${formatRVU(result.units)} = ${formatRVU(result.totalUnits)} wRVUs`;lines.append(p);}
}
$('cancel-edit').addEventListener('click',()=>{resetDraft();toast('Edit cancelled.');});
$('entry-form').addEventListener('submit',event=>{
  event.preventDefault();if(!Number.isInteger(draft.quantity)||draft.quantity<1||draft.quantity>100)return;
  const entry=validateEntry({...draft,lower:[...draft.lower],upper:[...draft.upper],date:selectedDate,id:editId??newId(),ruleVersion:RULE_VERSION,updatedAt:timestamp()});
  const next={...data,entries:[...data.entries.filter(e=>e.id!==entry.id),entry],tombstones:{...data.tombstones}};
  delete next.tombstones[entry.id];
  const wasEdit=!!editId;
  if(saveData(next)){resetDraft();toast(wasEdit?'Entry updated.':`${entry.quantity===1?'Case':entry.quantity+' cases'} saved · ${formatRVU(calculate(entry).totalUnits)} wRVUs`);}
});
function sideDescription(side,keys){return `${side}: ${keys.length?keys.map(k=>LABELS[k]).join(' + '):'Diagnostic'}`;}
function openEntry(e) {
  if(!pickDate(e.date))return;editId=e.id;
  draft={type:e.type,lower:[...e.lower],upper:[...e.upper],quantity:e.quantity};
  dirty=true;setTab('journal');render();renderForm();$('entry-form').scrollIntoView({behavior:'smooth',block:'center'});
}
function renderEntries(){
  const entries=data.entries.filter(e=>e.date===selectedDate).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  const total=entries.reduce((n,e)=>n+calculate(e).totalUnits,0), cases=entries.reduce((n,e)=>n+e.quantity,0);
  $('selected-total').textContent=formatRVU(total);$('selected-day-label').textContent=dateLabel(selectedDate,{weekday:'short',month:'short',day:'numeric'});$('entry-date').value=selectedDate;$('day-case-count').textContent=cases;
  const container=$('day-entries');container.replaceChildren();
  if(!entries.length){container.innerHTML='<div class="empty-state"><strong>A fresh page for the day.</strong>Add your first case above.</div>';return;}
  entries.forEach(e=>{
    const row=document.createElement('article');row.className='entry-row';const info=document.createElement('div');const title=document.createElement('h3');title.textContent=LABELS[e.type]+(e.quantity>1?` × ${e.quantity}`:'');info.append(title);
    for(const [side,keys] of [[e.type!=='egd'?'Lower':null,e.lower],[e.type!=='colon'?'Upper':null,e.upper]])if(side){const p=document.createElement('p');p.textContent=sideDescription(side,keys);info.append(p);}
    const result=calculate(e);
    const end=document.createElement('div');end.className='entry-end';const value=document.createElement('div');value.className='entry-value';value.textContent=formatRVU(result.totalUnits);const small=document.createElement('small');small.textContent='wRVUs';value.append(small);end.append(value);
    const actions=document.createElement('div');actions.className='entry-actions';
    const edit=document.createElement('button');edit.type='button';edit.textContent='✎';edit.setAttribute('aria-label',`Edit ${LABELS[e.type]} entry`);edit.addEventListener('click',()=>openEntry(e));
    const del=document.createElement('button');del.type='button';del.textContent='×';del.setAttribute('aria-label',`Delete ${LABELS[e.type]} entry`);del.addEventListener('click',()=>{
      const deleted={...e,lower:[...e.lower],upper:[...e.upper]};const next={...data,entries:data.entries.filter(x=>x.id!==e.id),tombstones:{...data.tombstones,[e.id]:timestamp()}};
      if(saveData(next)){if(editId===e.id)resetDraft();toast('Entry deleted.',()=>{deleted.updatedAt=timestamp();const next={...data,entries:[...data.entries,deleted],tombstones:{...data.tombstones}};delete next.tombstones[e.id];if(saveData(next))toast('Entry restored.');});}
    });actions.append(edit,del);end.append(actions);row.append(info,end);container.append(row);
  });
}
function renderRows(id,rows,detailed=false){
  const body=$(id);body.replaceChildren();
  if(!rows.length){body.innerHTML=`<tr class="table-empty"><td colspan="${detailed?9:4}">No saved days in this period yet.</td></tr>`;return;}
  rows.forEach(row=>{
    const tr=document.createElement('tr'),date=document.createElement('td'),button=document.createElement('button');button.className='text-button';button.textContent=dateLabel(row.date,{month:'short',day:'numeric',year:'numeric'});
    button.addEventListener('click',()=>{if(pickDate(row.date)){setTab('journal');window.scrollTo({top:0,behavior:'smooth'});}});date.append(button);tr.append(date);
    const values=detailed?[row.scheduledPatients,row.scheduledDoubles,row.scheduledProcedures,row.completedProcedures,row.colon,row.doubles,row.egd,formatRVU(row.units)]:[row.scheduledProcedures,row.completedProcedures,formatRVU(row.units)];
    for(const value of values){const td=document.createElement('td');td.textContent=value??'—';tr.append(td);}body.append(tr);
  });
}
function renderDaily(){ $('daily-month').textContent=monthLabel();renderRows('daily-totals',analyzeActivity(data.entries,data.schedules,{month}).rows); }
function renderAverages(){
  const selectedMonth=$('average-period').value==='month'?month:'',through=localDate();
  const summary=summarize(data.entries.filter(e=>e.date<=through),selectedMonth),activity=analyzeActivity(data.entries,data.schedules,{month:selectedMonth,through});
  $('average-period-label').textContent=`${selectedMonth?monthLabel():'All time'} · through ${dateLabel(through,{month:'short',day:'numeric',year:'numeric'})}`;
  $('average-value').textContent=summary.days?formatRVU(summary.averageUnits):'—';$('average-total').textContent=formatRVU(summary.units);$('average-days').textContent=summary.days;$('average-cases').textContent=`${summary.cases} completed patient encounters`;
  $('compensation-basis').textContent=summary.days?`Based on ${formatRVU(summary.averageUnits)} average wRVUs / day in this period.`:'Add completed cases to see daily estimates for this period.';
  for(const rate of [60,65,70])$('compensation-'+rate).textContent=summary.days?dollars.format(summary.averageUnits/10000*rate):'—';
  $('compensation-per-wrvu').textContent=summary.averageUnits>0?dollars.format(3500/(summary.averageUnits/10000)):'—';
  const adjusted=summarizeCMSStyle(data.entries.filter(e=>e.date<=through),selectedMonth);
  $('cms-basis').textContent=`${summary.days} completed-case days · same period as the full-wRVU average`;
  for(const [id,fullValue,adjustedValue] of [
    ['total',formatRVU(summary.units),formatRVU(adjusted.units)],
    ['average',summary.days?formatRVU(summary.averageUnits):'—',adjusted.days?formatRVU(adjusted.averageUnits):'—'],
    ...[60,65,70].map(rate=>[String(rate),summary.days?dollars.format(summary.averageUnits/10000*rate):'—',adjusted.days?dollars.format(adjusted.averageUnits/10000*rate):'—']),
    ['rate',summary.averageUnits>0?dollars.format(3500/(summary.averageUnits/10000)):'—',adjusted.averageUnits>0?dollars.format(3500/(adjusted.averageUnits/10000)):'—']
  ]){$('cms-full-'+id).textContent=fullValue;$('cms-adjusted-'+id).textContent=adjustedValue;}
  $('average-equation').textContent=`${activity.days} tracked day${activity.days===1?'':'s'} · ${activity.scheduleDays} with schedules`;renderRows('average-table',activity.rows,true);
  for(const [id,key,scheduled] of [['scheduled-patients','scheduledPatients',true],['completed-patients','cases',false],['scheduled','scheduledProcedures',true],['completed','completedProcedures',false],['colon','colon',false],['doubles','doubles',false],['egd','egd',false],['scheduled-doubles','scheduledDoubles',true]]){
    const count=scheduled?activity.scheduleDays:activity.days,value=activity.averages[key];
    $('average-'+id).textContent=value===null?'—':value.toFixed(2);
    $('average-'+id+'-detail').textContent=count?`${activity.totals[key]} ÷ ${count} ${scheduled?'schedule':'tracked'} day${count===1?'':'s'}`:'No data yet';
  }
  const trend=$('trend');trend.replaceChildren();const days=summary.rows.slice(0,14).reverse(),max=Math.max(1,...days.map(d=>d.units));
  if(!days.length){trend.innerHTML='<div class="empty-state">Your daily totals will appear here.</div>';return;}
  days.forEach(day=>{const column=document.createElement('div');column.className='bar-column';column.setAttribute('aria-label',`${day.date}: ${formatRVU(day.units)} wRVUs`);const track=document.createElement('div');track.className='bar-track';const bar=document.createElement('div');bar.className='bar';bar.style.height=`${day.units/max*100}%`;const value=document.createElement('small');value.textContent=formatRVU(day.units);bar.append(value);track.append(bar);const date=document.createElement('span');date.textContent=dateLabel(day.date,{month:'numeric',day:'numeric'});column.append(track,date);trend.append(column);});
}
$('average-period').addEventListener('change',renderAverages);
function render(){renderCalendar();renderEntries();renderSchedule();renderDaily();renderAverages();renderPayments();}
function savePayment(date, changes) {
  const prior=data.payments.find(p=>p.date===date) ?? {date,manual:false,paidAt:null};
  const payment=validatePayment({...prior,...changes,updatedAt:timestamp()});
  return saveData({...data,payments:[...data.payments.filter(p=>p.date!==date),payment]});
}
function renderPayments() {
  const rows=paymentRows(data),archived=$('payments-archive').checked;
  const visible=rows.filter(p=>p.archived===archived),body=$('payment-rows');body.replaceChildren();
  $('payment-summary').textContent=`${rows.filter(p=>!p.paidAt).length} unpaid · ${rows.filter(p=>p.paidAt&&!p.archived).length} recently paid · ${rows.filter(p=>p.archived).length} archived`;
  if(!visible.length){body.innerHTML=`<tr><td colspan="3" class="muted">${archived?'No archived payments.':'No dates to track. Log a case or schedule, or add a date above.'}</td></tr>`;return;}
  for(const p of visible){
    const tr=document.createElement('tr'),date=document.createElement('td'),paid=document.createElement('td'),details=document.createElement('td');
    date.textContent=dateLabel(p.date,{month:'short',day:'numeric',year:'numeric'});
    const box=document.createElement('input');box.type='checkbox';box.checked=!!p.paidAt;box.disabled=blockedStorage;box.setAttribute('aria-label',`Paid for ${p.date}`);
    box.addEventListener('change',()=>{if(!savePayment(p.date,{paidAt:box.checked?new Date().toISOString():null}))box.checked=!!p.paidAt;});paid.append(box);
    const label=document.createElement('span');label.textContent=p.paidAt?`Paid ${new Date(p.paidAt).toLocaleDateString('en-US')}`:p.logged?(p.manual?'Logged + manual':'Logged'):'Manual';details.append(label);
    if(p.manual&&!p.logged){const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove';remove.disabled=blockedStorage;remove.setAttribute('aria-label',`Remove manual date ${p.date}`);remove.addEventListener('click',()=>{
      if(savePayment(p.date,{manual:false,paidAt:null}))toast('Manual date removed.',()=>{if(savePayment(p.date,{manual:true,paidAt:p.paidAt}))toast('Date restored.');});
    });details.append(remove);}
    tr.append(date,paid,details);body.append(tr);
  }
}
$('payment-date').addEventListener('input',()=>{paymentDirty=!!$('payment-date').value;});
$('payment-add-form').addEventListener('submit',event=>{
  event.preventDefault();const date=$('payment-date').value;if(!validDate(date))return;
  if(paymentRows(data).some(p=>p.date===date)){toast('That date is already tracked. Check archived payments if it is hidden.');return;}
  if(savePayment(date,{manual:true,paidAt:null})){$('payment-date').value='';paymentDirty=false;toast('Date added to payment tracker.');considerUpdate();}
});
$('payments-archive').addEventListener('change',renderPayments);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderPayments();});
setInterval(renderPayments,60000);
function download(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('export-json').addEventListener('click',()=>{
  if(blockedStorage&&rawStorage){download(rawStorage,'application/json',`rvu-daily-recovery-${localDate()}.json`);return;}
  download(JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),'application/json',`rvu-daily-backup-${localDate()}.json`);$('backup-status').textContent=`Exported ${data.entries.length} saved entries and ${data.schedules.length} daily schedules, including payment tracking. Keep this file to restore or transfer phones.`;
});
$('export-original').addEventListener('click',()=>{const original=localStorage.getItem(RECOVERY_KEY);if(original)download(original,'application/json',`rvu-daily-before-wrvu-update.json`);});
$('export-csv').addEventListener('click',()=>{const rows=analyzeActivity(data.entries,data.schedules).rows;download('Date,Scheduled patients,Scheduled doubles,Scheduled procedures,Completed patients,Completed procedures,Completed colonoscopies,Completed doubles,Completed EGDs,Work RVUs\r\n'+rows.map(r=>[r.date,r.scheduledPatients,r.scheduledDoubles,r.scheduledProcedures,r.cases,r.completedProcedures,r.colon,r.doubles,r.egd,formatRVU(r.units)].join(',')).join('\r\n'),'text/csv',`rvu-daily-totals-${localDate()}.csv`);$('backup-status').textContent='Daily totals and schedules exported. Use the JSON backup for importing.';});
$('import-json').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try { if(file.size>10*1024*1024)throw new Error('Backup is too large (maximum 10 MB).');pendingImport=parseBackup(await file.text());const result=mergeData(data,pendingImport);const days=analyzeActivity(result.entries,result.schedules).days;
    $('import-summary').textContent=`This backup includes ${pendingImport.payments.length} payment records, ${pendingImport.entries.length} saved entries and ${pendingImport.schedules.length} daily schedules. After merging: ${result.entries.length} entries and ${result.schedules.length} schedules across ${days} tracked days.`;$('import-dialog').showModal();
  } catch(error){pendingImport=null;$('backup-status').textContent=error.message;}
});
$('cancel-import').addEventListener('click',()=>{pendingImport=null;$('import-dialog').close();});
$('confirm-import').addEventListener('click',()=>{if(!pendingImport)return;const next=mergeData(data,pendingImport);if(saveData(next)){$('backup-status').textContent=`Import complete: ${data.entries.length} entries and ${data.schedules.length} daily schedules, including payment tracking.`;pendingImport=null;$('import-dialog').close();toast('Backup merged.');}});
$('settings-open').addEventListener('click',()=>$('settings-dialog').showModal());$('settings-close').addEventListener('click',()=>$('settings-dialog').close());
const rateContainer=$('rates-table'),rateTable=document.createElement('table');rateTable.innerHTML='<thead><tr><th>Procedure</th><th>CPT</th><th>wRVUs</th></tr></thead>';const rateBody=document.createElement('tbody');
for(const side of ['colon','egd'])for(const key of ['diagnostic',...TECHNIQUES]){const row=document.createElement('tr');for(const text of [`${LABELS[side]} · ${LABELS[key]}`,RATES[side][key].code,formatRVU(RATES[side][key].units)]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}rateBody.append(row);}rateTable.append(rateBody);rateContainer.append(rateTable);
function considerUpdate(){
  if(reloadNeeded){if(dirty||scheduleDirty||paymentDirty||editId||pendingImport){$('update-notice').hidden=false;return;}if(!reloading){reloading=true;location.reload();}return;}
  if(!waitingWorker)return;
  if(dirty||scheduleDirty||paymentDirty||editId||pendingImport){$('update-notice').hidden=false;return;}
  waitingWorker.postMessage({type:'SKIP_WAITING'});
}
$('apply-update').addEventListener('click',()=>{if((dirty||scheduleDirty||paymentDirty||editId||pendingImport)&&!confirm('Apply the update? Saved entries are safe, but your unsaved form or pending import will be cleared.'))return;if(reloadNeeded){location.reload();return;}waitingWorker?.postMessage({type:'SKIP_WAITING'});});
if('serviceWorker'in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController){hadController=true;return;}reloadNeeded=true;considerUpdate();});
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
    swRegistration=reg;if(reg.waiting){waitingWorker=reg.waiting;considerUpdate();}
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){if(navigator.serviceWorker.controller){waitingWorker=worker;considerUpdate();}else worker.postMessage({type:'SKIP_WAITING'});}});});
    reg.update().catch(()=>{});
  }).catch(()=>{$('update-status').textContent='Offline installation is unavailable in this browser. Saved entries still work.';});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){swRegistration?.update().catch(()=>{});considerUpdate();}});
}
$('check-update').addEventListener('click',async()=>{if(!swRegistration){$('update-status').textContent='Updates require an HTTPS browser that supports service workers.';return;}$('update-status').textContent='Checking…';try{await swRegistration.update();if(swRegistration.waiting){waitingWorker=swRegistration.waiting;considerUpdate();$('update-status').textContent='Update ready.';}else $('update-status').textContent=swRegistration.installing?'Downloading the new version…':'Up to date · v1.3.1';}catch{$('update-status').textContent='Could not check while offline. The app will retry when opened online.';}});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-app').hidden=false;});
$('install-app').addEventListener('click',async()=>{await installPrompt?.prompt();installPrompt=null;$('install-app').hidden=true;});
window.addEventListener('appinstalled',()=>{$('install-app').hidden=true;});
render();renderForm();

