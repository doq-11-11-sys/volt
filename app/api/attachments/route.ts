import { env } from 'cloudflare:workers';
import { currentUser, db, errorResponse, PortalError, ticketFor, validateOrigin } from '@/lib/portal-server';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 validateOrigin(req);const me=await currentUser();if(Number(req.headers.get('content-length')??0)>6*1024*1024)throw new PortalError('Максимальный размер файла — 5 МБ.',413);
 const form=await req.formData(),file=form.get('file'),ticket=String(form.get('ticket_id')??'');await ticketFor(me,ticket);
 if(!(file instanceof File)||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new PortalError('Выберите JPG, PNG, WebP или PDF до 5 МБ.');
 if(!env.BUCKET)throw new PortalError('Загрузка файлов временно недоступна.',503);
 const count=await db().prepare('SELECT COUNT(*) AS n FROM attachments WHERE ticket_id=?').bind(ticket).first<{n:number}>();if((count?.n??0)>=10)throw new PortalError('К заявке можно приложить до 10 файлов.');
 const id=crypto.randomUUID(),filename=file.name.replace(/[\r\n\\/]/g,'_').slice(0,180);
 await env.BUCKET.put(id,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
 try{await db().prepare('INSERT INTO attachments (id,ticket_id,filename,mime,size,created_at) VALUES (?,?,?,?,?,?)').bind(id,ticket,filename,file.type,file.size,new Date().toISOString()).run()}catch(e){await env.BUCKET.delete(id);throw e;}
 return Response.json({ok:true});
}catch(e){return errorResponse(e)}}
export async function GET(req:Request){try{
 const me=await currentUser(),id=new URL(req.url).searchParams.get('id');const row=await db().prepare('SELECT * FROM attachments WHERE id=?').bind(id).first<{ticket_id:string;filename:string;mime:string}>();if(!row)throw new PortalError('Файл не найден.',404);await ticketFor(me,row.ticket_id);
 const file=await env.BUCKET?.get(id!);if(!file)throw new PortalError('Файл недоступен.',404);
 return new Response(file.body,{headers:{'Content-Type':row.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return errorResponse(e)}}
