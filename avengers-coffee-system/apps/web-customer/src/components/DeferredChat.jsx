import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { uiText as ui, useUiLanguage } from '../lib/uiText';
const loadChat = () => import('./ChatWidget');
export default function DeferredChat(props) {
  useUiLanguage();
  const [Widget, setWidget] = useState(null), [busy, setBusy] = useState(false), [mode, setMode] = useState(null);
  const pending = useRef(null), alive = useRef(true);
  const load = useCallback(() => {
    if (!pending.current) pending.current = loadChat().then(module => { if (alive.current) setWidget(() => module.default); }).catch(() => { pending.current = null; }).finally(() => { if (alive.current) setBusy(false); });
    return pending.current;
  }, []);
  useEffect(() => {
    alive.current = true;
    const idle = window.requestIdleCallback?.(load,{ timeout:2500 });
    const timer = idle == null ? setTimeout(load,1200) : null;
    return () => { alive.current = false; if (idle != null) window.cancelIdleCallback?.(idle); clearTimeout(timer); };
  }, [load]);
  useEffect(() => {
    if (Widget) return;
    const open = event => { setMode(event.detail?.mode === 'STAFF' ? 'STAFF' : 'AI'); setBusy(true); void load(); };
    window.addEventListener('avengers:open-chat',open);
    return () => window.removeEventListener('avengers:open-chat',open);
  }, [Widget,load]);
  if (Widget) return <Widget {...props} initialMode={mode} />;
  return <button type="button" aria-label={ui('Mở trò chuyện')} aria-busy={busy} disabled={busy} onPointerEnter={load} onFocus={load} onClick={() => { setMode('AI'); setBusy(true); void load(); }} style={{position:'fixed',right:22,bottom:22,width:60,height:60,zIndex:100,borderRadius:'50%',background:'#b22830',color:'#fff',border:'3px solid white',boxShadow:'0 5px 20px #b2283040',padding:15,cursor:'pointer'}}><ChatBubbleLeftRightIcon /></button>;
}
