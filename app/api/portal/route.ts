import { errorResponse, identity, loadPortal, mutate, PortalError, validateOrigin } from '@/lib/portal-server';
export const dynamic='force-dynamic';
export async function GET(){try{await identity();return Response.json(await loadPortal(),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{validateOrigin(req);if(!req.headers.get('content-type')?.startsWith('application/json'))throw new PortalError('Требуется JSON.');const raw=await req.text();if(raw.length>18000)throw new PortalError('Слишком большой запрос.',413);const {action,data}=JSON.parse(raw);return Response.json(await mutate(action,data));}catch(e){return errorResponse(e)}}
