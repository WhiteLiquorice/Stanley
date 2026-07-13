import { useEffect, useState } from 'react';
import { listTrustExceptions } from '../trust-engine/web-client/trustClient';
export function ExceptionNavBadge() { const [count, setCount] = useState(0); useEffect(() => { listTrustExceptions('open').then(items => setCount(items.length)).catch(() => {}); }, []); return count ? <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{count > 99 ? '99+' : count}</span> : null; }
