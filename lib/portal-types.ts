export type Role = 'admin' | 'dispatcher' | 'electrician' | 'employee' | 'pending' | 'blocked';
export type Status = 'new' | 'assigned' | 'in_progress' | 'waiting' | 'review' | 'closed' | 'cancelled';
export type Priority = 'critical' | 'high' | 'normal' | 'low';
export interface Person { id: string; name: string; email?: string; department: string; position?: string; phone?: string; role: Role; created_at?: string }
export interface Ticket { id: string; number: number; title: string; description: string; location: string; equipment_id: string | null; priority: Priority; status: Status; kind: 'request' | 'ppr'; creator_id: string; assignee_id: string | null; due_date: string; scheduled_date: string; estimated_hours: number; actual_hours: number | null; result: string; plan_id: string | null; created_at: string; updated_at: string; closed_at: string | null }
export interface Equipment { id: string; name: string; code: string; location: string; category: string; condition: string; notes: string }
export interface Plan { id: string; title: string; equipment_id: string | null; location: string; start_date: string; interval_days: number; occurrences: number; estimated_hours: number; assignee_id: string | null; created_at: string }
export interface Activity { id: string; ticket_id: string | null; actor_id: string; actor_name: string; type: string; message: string; created_at: string }
export interface Attachment { id: string; ticket_id: string; filename: string; mime: string; size: number; created_at: string }
export interface PortalState { viewer: { name: string; email: string } | null; me: Person | null; people: Person[]; tickets: Ticket[]; equipment: Equipment[]; plans: Plan[]; activity: Activity[]; attachments: Attachment[]; firstRegistration: boolean; error?: string }
export const roleLabels: Record<Role,string> = {admin:'Администратор',dispatcher:'Диспетчер',electrician:'Электромонтёр',employee:'Сотрудник',pending:'Ожидает одобрения',blocked:'Доступ заблокирован'};
export const statusLabels: Record<Status,string> = {new:'Новая',assigned:'Назначена',in_progress:'В работе',waiting:'Ожидание',review:'На проверке',closed:'Выполнена',cancelled:'Отменена'};
export const priorityLabels: Record<Priority,string> = {critical:'Аварийный',high:'Высокий',normal:'Обычный',low:'Низкий'};
export const done = (t:Ticket) => ['closed','cancelled'].includes(t.status);
export const todayISO = () => new Date().toISOString().slice(0,10);
export const dayISO = (offset:number, base=new Date()) => {const d=new Date(base);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
export const dateLabel = (v:string,opts:Intl.DateTimeFormatOptions={day:'numeric',month:'short'}) => v?new Date(v.slice(0,10)+'T12:00:00Z').toLocaleDateString('ru-RU',opts):'—';
export const manager = (role?:Role) => role === 'admin' || role === 'dispatcher';
