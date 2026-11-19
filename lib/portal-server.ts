import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { z } from 'zod';
import { dayISO, manager, statusLabels, type Person, type Ticket, type PortalState } from './portal-types';
export function db(){if(!env.DB)throw new Error('Хранилище временно недоступно. Попробуйте позже.');return env.DB;}
export class PortalError extends Error{constructor(message:string,public status=400){super(message)}}
export const emptyState:PortalState={viewer:null,me:null,people:[],tickets:[],equipment:[],plans:[],activity:[],attachments:[],firstRegistration:false};
export async function identity(){const viewer=await getChatGPTUser();if(!viewer)throw new PortalError('Войдите через ChatGPT.',401);return viewer;}
export async function currentUser(){const v=await identity();const me=await db().prepare('SELECT * FROM users WHERE id=?').bind(v.userId).first<Person>();if(!me)throw new PortalError('Заполните профиль для регистрации.',403);if(['pending','blocked'].includes(me.role))throw new PortalError('Дождитесь назначения роли администратором.',403);return me;}
export function canSee(me:Person,t:Ticket){return manager(me.role)||t.creator_id===me.id||me.role==='electrician'&&(t.assignee_id===me.id||!t.assignee_id);}
export async function ticketFor(me:Person,id:string){const t=await db().prepare('SELECT * FROM tickets WHERE id=?').bind(id).first<Ticket>();if(!t||!canSee(me,t))throw new PortalError('Заявка не найдена.',404);return t;}
export async function loadPortal():Promise<PortalState>{
 try{
  const viewer=await getChatGPTUser();if(!viewer)return emptyState;
  const database=db();const me=await database.prepare('SELECT * FROM users WHERE id=?').bind(viewer.userId).first<Person>();
  const base={...emptyState,viewer:{name:viewer.fullName??'',email:viewer.email},me};
  if(!me){const count=await database.prepare('SELECT COUNT(*) AS count FROM users').first<{count:number}>();return {...base,firstRegistration:count?.count===0};}
  if(['pending','blocked'].includes(me.role))return base;
  const condition=manager(me.role)?'1=1':me.role==='electrician'?'(t.assignee_id=? OR t.assignee_id IS NULL OR t.creator_id=?)':'t.creator_id=?';
  const args=manager(me.role)?[]:me.role==='electrician'?[me.id,me.id]:[me.id];
  const q=(sql:string,values:unknown[]=[])=>database.prepare(sql).bind(...values).all();
  const [tickets,people,equipment,plans,activity,attachments]=await Promise.all([
   q(`SELECT t.* FROM tickets t WHERE ${condition} ORDER BY t.number DESC`,args),
   q(me.role==='admin'?'SELECT * FROM users ORDER BY created_at DESC':"SELECT id,name,department,role FROM users WHERE role IN ('admin','dispatcher','electrician') OR id=?",me.role==='admin'?[]:[me.id]),
   q('SELECT * FROM equipment ORDER BY code'),
   manager(me.role)?q('SELECT * FROM plans ORDER BY start_date'):{results:[]},
   q(`SELECT a.*,u.name AS actor_name FROM activity a JOIN users u ON u.id=a.actor_id WHERE ${manager(me.role)?'1=1':`a.ticket_id IN (SELECT t.id FROM tickets t WHERE ${condition})`} ORDER BY a.created_at DESC LIMIT 300`,args),
   q(`SELECT a.* FROM attachments a WHERE a.ticket_id IN (SELECT t.id FROM tickets t WHERE ${condition})`,args)
  ]);
  return {...base,tickets:tickets.results,people:people.results,equipment:equipment.results,plans:plans.results,activity:activity.results,attachments:attachments.results} as unknown as PortalState;
 }catch(error){console.error('portal-load',error instanceof Error?error.message:'unknown');return {...emptyState,error:'Не удалось загрузить рабочие данные. Обновите страницу или повторите позже.'};}
}
const str=(min=1,max=200)=>z.string().trim().min(min).max(max);
const id=z.string().min(1).max(180);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s},'Укажите корректную дату');
const hours=z.number().min(.25).max(1000);
const priority=z.enum(['critical','high','normal','low']);
const role=z.enum(['admin','dispatcher','electrician','employee','pending','blocked']);
const profile=z.object({name:str(2,100),department:str(2,100),position:str(0,100).default(''),phone:str(0,40).default('')});
const importedTicket=z.object({id:id,title:str(5,180),description:str(10,5000),location:str(2,150),due_date:date,scheduled_date:date,estimated_hours:hours,actual_hours:hours.nullable().optional(),result:str(0,5000).default('')});
function audit(me:Person,ticket:string|null,type:string,message:string){return db().prepare('INSERT INTO activity (id,ticket_id,actor_id,type,message,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),ticket,me.id,type,message,new Date().toISOString());}
function requireManager(me:Person){if(!manager(me.role))throw new PortalError('Нужны права диспетчера или администратора.',403);}
async function validateRefs(equipmentId:string|null|undefined,assigneeId:string|null|undefined){
 if(equipmentId&&!await db().prepare('SELECT id FROM equipment WHERE id=?').bind(equipmentId).first())throw new PortalError('Оборудование не найдено.');
 if(assigneeId&&!await db().prepare("SELECT id FROM users WHERE id=? AND role='electrician'").bind(assigneeId).first())throw new PortalError('Выберите действующего электромонтёра.');
}
export async function mutate(action:string,input:unknown){
 const database=db(),now=new Date().toISOString();
 if(action==='register'){
  const viewer=await identity(),data=profile.parse(input);
  // New Sites are owner-private. The first verified visitor is therefore the owner.
  // A single SQLite statement makes the initial administrator claim atomic.
  await database.prepare("INSERT INTO users (id,name,email,department,position,phone,role,created_at) SELECT ?,?,?,?,?,?,CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'admin' ELSE 'pending' END,? ON CONFLICT(id) DO NOTHING").bind(viewer.userId,data.name,viewer.email,data.department,data.position,data.phone,now).run();
  return {ok:true};
 }
 const me=await currentUser();
 if(action==='profile'){
  const p=profile.parse(input);await database.prepare('UPDATE users SET name=?,department=?,position=?,phone=? WHERE id=?').bind(p.name,p.department,p.position,p.phone,me.id).run();return {ok:true};
 }
 if(action==='role'){
  if(me.role!=='admin')throw new PortalError('Только администратор назначает роли.',403);
  const p=z.object({id,role}).parse(input);if(p.id===me.id)throw new PortalError('Изменить собственную роль нельзя.');
  const target=await database.prepare('SELECT * FROM users WHERE id=?').bind(p.id).first<Person>();if(!target)throw new PortalError('Сотрудник не найден.',404);
  if(p.role!=='electrician'&&await database.prepare("SELECT id FROM tickets WHERE assignee_id=? AND status NOT IN ('closed','cancelled') LIMIT 1").bind(p.id).first())throw new PortalError('Сначала переназначьте открытые работы этого электромонтёра.');
  await database.batch([database.prepare('UPDATE users SET role=? WHERE id=?').bind(p.role,p.id),audit(me,null,'role',`Роль ${target.name} изменена: ${p.role}`)]);return {ok:true};
 }
 if(action==='create_ticket'){
  const p=z.object({title:str(5,180),description:str(10,5000),location:str(2,150),equipment_id:id.nullable().optional(),priority,due_date:date,estimated_hours:hours.default(2)}).parse(input);
  await validateRefs(p.equipment_id,null);const tid=crypto.randomUUID();
  await database.batch([database.prepare("INSERT INTO tickets (id,title,description,location,equipment_id,priority,status,kind,creator_id,due_date,scheduled_date,estimated_hours,created_at,updated_at) VALUES (?,?,?,?,?,?,'new','request',?,?,?,?,?,?)").bind(tid,p.title,p.description,p.location,p.equipment_id??null,p.priority,me.id,p.due_date,now.slice(0,10),p.estimated_hours,now,now),audit(me,tid,'created','Создана заявка')]);return {ok:true,id:tid};
 }
 if(action==='update_ticket'){
  const p=z.object({id,updated_at:str(),status:z.enum(['new','assigned','in_progress','waiting','review','closed','cancelled']),assignee_id:id.nullable(),due_date:date,estimated_hours:hours,actual_hours:hours.nullable(),result:str(0,5000)}).parse(input);
  const t=await ticketFor(me,p.id),isManager=manager(me.role),isTech=me.role==='electrician'&&t.assignee_id===me.id;
  if(t.updated_at!==p.updated_at)throw new PortalError('Заявка уже изменена. Обновите данные и повторите.',409);
  if(['closed','cancelled'].includes(t.status))throw new PortalError('Заявка завершена. Создайте новую при повторной неисправности.');
  const techTransitions:Record<string,string[]>={assigned:['in_progress'],in_progress:['waiting','review'],waiting:['in_progress'],review:['in_progress']};
  if(!isManager){
   const ownerAccept=t.creator_id===me.id&&t.status==='review'&&p.status==='closed';
   const ownerCancel=t.creator_id===me.id&&t.status==='new'&&p.status==='cancelled';
   if(!ownerAccept&&!ownerCancel&&!(isTech&&(techTransitions[t.status]??[]).includes(p.status)))throw new PortalError('Это действие недоступно для вашей роли.',403);
   if(p.assignee_id!==t.assignee_id||p.due_date!==t.due_date||p.estimated_hours!==t.estimated_hours)throw new PortalError('Назначение и сроки изменяет диспетчер.',403);
   if(!isTech&&(p.actual_hours!==t.actual_hours||p.result!==t.result))throw new PortalError('Отчёт изменяет исполнитель.',403);
  }
  if(['assigned','in_progress','waiting','review'].includes(p.status)&&!p.assignee_id)throw new PortalError('Назначьте электромонтёра.');
  if(['review','closed'].includes(p.status)&&(!p.actual_hours||p.result.length<5))throw new PortalError('Укажите фактические часы и результат работ.');
  await validateRefs(null,p.assignee_id);
  const changed=await database.prepare('UPDATE tickets SET status=?,assignee_id=?,due_date=?,estimated_hours=?,actual_hours=?,result=?,updated_at=?,closed_at=? WHERE id=? AND updated_at=?').bind(p.status,p.assignee_id,p.due_date,p.estimated_hours,p.actual_hours,p.result,now,p.status==='closed'?now:null,p.id,p.updated_at).run();
  if(!changed.meta.changes)throw new PortalError('Заявка уже изменена. Обновите данные.',409);
  await audit(me,p.id,'status',`${statusLabels[p.status]}${p.assignee_id!==t.assignee_id?' · изменён исполнитель':''}`).run();return {ok:true};
 }
 if(action==='comment'){
  const p=z.object({id,message:str(1,3000)}).parse(input);await ticketFor(me,p.id);await audit(me,p.id,'comment',p.message).run();return {ok:true};
 }
 if(action==='equipment'){
  requireManager(me);const p=z.object({id:id.optional(),name:str(2,180),code:str(2,60),location:str(2,150),category:str(2,100),condition:z.enum(['normal','attention','repair']),notes:str(0,3000)}).parse(input);
  await database.batch([database.prepare('INSERT INTO equipment (id,name,code,location,category,condition,notes) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,location=excluded.location,category=excluded.category,condition=excluded.condition,notes=excluded.notes').bind(p.id??crypto.randomUUID(),p.name,p.code,p.location,p.category,p.condition,p.notes),audit(me,null,'equipment',`Обновлена карточка оборудования: ${p.name}`)]);return {ok:true};
 }
 if(action==='import_closed_tickets'){
  requireManager(me);
  const p=z.object({source:str(1,180),tickets:z.array(importedTicket).min(1).max(25)}).parse(input);
  const now=new Date().toISOString();
  const stmts=p.tickets.map(t=>database.prepare("INSERT OR IGNORE INTO tickets (id,title,description,location,equipment_id,priority,status,kind,creator_id,assignee_id,due_date,scheduled_date,estimated_hours,actual_hours,result,created_at,updated_at,closed_at) VALUES (?,?,?,?,?,'normal','closed','request',?,?,?,?,?,?,?,?,?,?)").bind(t.id,t.title,t.description,t.location,null,me.id,null,t.due_date,t.scheduled_date,t.estimated_hours,t.actual_hours??null,t.result,now,now,t.due_date+'T12:00:00.000Z'));
  stmts.push(audit(me,null,'import',`Импортированы закрытые заявки: ${p.tickets.length} · ${p.source}`));
  await database.batch(stmts);
  const ids=p.tickets.map(t=>t.id);const placeholders=ids.map(()=>'?').join(',');const count=await database.prepare(`SELECT COUNT(*) AS count FROM tickets WHERE id IN (${placeholders})`).bind(...ids).first<{count:number}>();
  return {ok:true,imported:Number(count?.count??0)};
 }
 if(action==='create_plan'){
  requireManager(me);const p=z.object({title:str(5,180),description:str(0,5000).default('Плановые работы по регламенту предприятия.'),equipment_id:id.nullable(),location:str(2,150),start_date:date,interval_days:z.number().int().min(1).max(366),occurrences:z.number().int().min(1).max(12),estimated_hours:hours,assignee_id:id.nullable()}).parse(input);
  await validateRefs(p.equipment_id,p.assignee_id);const pid=crypto.randomUUID();
  const stmts=[database.prepare('INSERT INTO plans (id,title,equipment_id,location,start_date,interval_days,occurrences,estimated_hours,assignee_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(pid,p.title,p.equipment_id,p.location,p.start_date,p.interval_days,p.occurrences,p.estimated_hours,p.assignee_id,now)];
  for(let i=0;i<p.occurrences;i++){const tid=crypto.randomUUID(),scheduled=dayISO(p.interval_days*i,new Date(p.start_date+'T12:00:00Z'));stmts.push(database.prepare("INSERT INTO tickets (id,title,description,location,equipment_id,priority,status,kind,creator_id,assignee_id,due_date,scheduled_date,estimated_hours,plan_id,created_at,updated_at) VALUES (?,?,?,?,?,'normal',?,'ppr',?,?,?,?,?,?,?,?)").bind(tid,p.title,p.description,p.location,p.equipment_id,p.assignee_id?'assigned':'new',me.id,p.assignee_id,scheduled,scheduled,p.estimated_hours,pid,now,now));}
  stmts.push(audit(me,null,'plan',`Создан график ППР: ${p.title} · работ: ${p.occurrences}`));await database.batch(stmts);return {ok:true,id:pid};
 }
 throw new PortalError('Неизвестное действие.');
}
export function validateOrigin(req:Request){const origin=req.headers.get('origin');if(req.headers.get('sec-fetch-site')==='cross-site'||origin&&new URL(origin).host!==new URL(req.url).host)throw new PortalError('Недопустимый источник запроса.',403);}
export function errorResponse(error:unknown){
 if(error instanceof z.ZodError)return Response.json({error:'Проверьте поля: '+error.issues.map(v=>v.path.join('.')).join(', ')},{status:400});
 if(error instanceof PortalError)return Response.json({error:error.message},{status:error.status});
 console.error('portal-mutation',error instanceof Error?error.message:'unknown');
 return Response.json({error:'Не удалось сохранить. Проверьте соединение и повторите. Для оборудования проверьте уникальность инвентарного номера.'},{status:500});
}
