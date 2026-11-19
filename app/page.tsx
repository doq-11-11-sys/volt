import Portal from '@/components/portal';
import { loadPortal } from '@/lib/portal-server';
export const dynamic = 'force-dynamic';
export default async function Home() { return <Portal initial={await loadPortal()} section="overview" />; }
