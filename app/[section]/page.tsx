import Portal from '@/components/portal';
import { loadPortal } from '@/lib/portal-server';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Section({params}:{params:Promise<{section:string}>}) {const {section}=await params;if(!['requests','ppr','equipment','digital-twin','analytics','team','activity','profile','help'].includes(section))notFound();return <Portal initial={await loadPortal()} section={section}/>;}
