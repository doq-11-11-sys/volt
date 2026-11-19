import { dayISO, done, type Person, type Ticket, todayISO } from './portal-types';
// Weighted k-nearest-neighbour regression, using only accepted jobs with recorded labour hours.
export function predictHours(job:Ticket, history:Ticket[]) {
 const training=history.filter(t=>t.status==='closed' && (t.actual_hours??0)>0 && t.estimated_hours>0);
 if(training.length<5)return {hours:job.estimated_hours,low:job.estimated_hours*.8,high:job.estimated_hours*1.4,method:'baseline' as const,samples:training.length};
 const near=training.map(t=>({t,d:Math.abs(Math.log(t.estimated_hours/job.estimated_hours))+(t.kind===job.kind?0:1)+(t.equipment_id&&t.equipment_id===job.equipment_id?0:.6)+(t.priority===job.priority?0:.3)})).sort((a,b)=>a.d-b.d).slice(0,Math.min(7,training.length));
 const weight=near.reduce((s,v)=>s+1/(.2+v.d),0);
 const ratio=near.reduce((s,v)=>s+(v.t.actual_hours!/v.t.estimated_hours)/(.2+v.d),0)/weight;
 const spread=Math.sqrt(near.reduce((s,v)=>s+(v.t.actual_hours!/v.t.estimated_hours-ratio)**2,0)/near.length);
 const hours=Math.max(.25,Math.round(job.estimated_hours*ratio*10)/10);
 return {hours,low:Math.max(.25,job.estimated_hours*(ratio-spread)),high:job.estimated_hours*(ratio+spread),method:'knn' as const,samples:training.length};
}
export function forecast(tickets:Ticket[],people:Person[],dailyHours=6) {
 const techs=people.filter(p=>p.role==='electrician');
 const calendars:Record<string,Record<string,number>>={};
 const today=todayISO();
 const workday=(date:string)=>{let d=date;while([0,6].includes(new Date(d+'T12:00:00Z').getUTCDay()))d=dayISO(1,new Date(d));return d;};
 const rankings={critical:0,high:1,normal:2,low:3};
 const jobs=tickets.filter(t=>!done(t)&&t.status!=='review').sort((a,b)=>rankings[a.priority]-rankings[b.priority]||a.due_date.localeCompare(b.due_date));
 const result=jobs.map(job=>{
  const prediction=predictHours(job,tickets);
  const assignee=techs.find(p=>p.id===job.assignee_id);
  if(!assignee)return {id:job.id,date:null as string|null,late:false,unassigned:true,...prediction};
  const calendar=calendars[assignee.id]??{};
  let date=workday(job.scheduled_date>today?job.scheduled_date:today);
  let remaining=prediction.hours;
  while(remaining>0){const booked=calendar[date]??0;const used=Math.min(remaining,Math.max(0,dailyHours-booked));calendar[date]=booked+used;remaining-=used;if(remaining>0)date=workday(dayISO(1,new Date(date)));}
  calendars[assignee.id]=calendar;
  return {id:job.id,date,late:date>job.due_date,unassigned:false,...prediction};
 });
 const ppr=result.filter(r=>tickets.find(t=>t.id===r.id)?.kind==='ppr');
 const samples=tickets.filter(t=>t.status==='closed'&&(t.actual_hours??0)>0).length;
 return {jobs:result,ppr,samples,method:samples>=5?'knn':'baseline',late:result.filter(r=>r.late).length,unassigned:result.filter(r=>r.unassigned).length,hours:Math.round(result.reduce((s,r)=>s+r.hours,0)),dailyHours};
}
