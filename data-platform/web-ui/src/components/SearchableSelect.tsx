import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import { foldSearch } from '../utils/dashboardDiscovery.mjs';

type Option={value:string;label:string;description?:string};
/** Text search selects only an existing value; unmatched text never becomes a filter. */
export const SearchableSelect:React.FC<{label:string;value:string;options:Option[];onChange:(value:string)=>void;placeholder?:string;disabled?:boolean;className?:string}>=({label,value,options,onChange,placeholder='Gõ để tìm và chọn…',disabled,className=''})=>{
  const id=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const selected=options.find(o=>o.value===value);
  const matches=useMemo(()=>options.filter(o=>!query||foldSearch(o.label+' '+o.value+' '+(o.description||'')).includes(foldSearch(query))),[options,query]);
  useEffect(()=>{const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
  useEffect(()=>setActive(0),[query]);
  useEffect(()=>{if(!open)return;const option=document.getElementById(`${id}-opt-${active}`),list=document.getElementById(`${id}-list`);if(!option||!list)return;const a=option.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom;else if(a.top<b.top)list.scrollTop-=b.top-a.top;},[active,open,id]);
  useEffect(()=>{setOpen(false);setQuery('');},[value,disabled]);
  const choose=(option:Option)=>{onChange(option.value);setOpen(false);setQuery('');input.current?.focus();};
  return <div ref={root} className={`searchable-select ${className}`} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}}>
    <div className="searchable-select-input"><input ref={input} role="combobox" type="text" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open&&matches[active]?`${id}-opt-${active}`:undefined}
      autoComplete="off" disabled={disabled} value={open?query:selected?.label||''} placeholder={open?'Gõ tên, bỏ dấu cũng được…':placeholder}
      onFocus={()=>{setOpen(true);setQuery('');}} onClick={()=>{if(!open){setOpen(true);setQuery('');}}} onChange={e=>{setQuery(e.target.value);setOpen(true);}}
      onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(matches.length-1,i+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'){e.preventDefault();if(open&&matches[active])choose(matches[active]);else setOpen(true);}if(e.key==='Tab')setOpen(false);}}/>
      <button type="button" tabIndex={-1} aria-label={`Mở ${label}`} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>{input.current?.focus();setOpen(!open);setQuery('');}} className="searchable-select-arrow">⌄</button>
    </div>
    {open&&!disabled&&<div className="searchable-select-popover"><p className="searchable-select-count">{matches.length} lựa chọn · ↑ ↓ di chuyển · Enter chọn</p><div id={`${id}-list`} role="listbox" aria-label={label} className="searchable-select-options">{matches.map((option,i)=><button type="button" id={`${id}-opt-${i}`} key={option.value} role="option" aria-selected={option.value===value} tabIndex={-1} className={i===active?'is-active':''} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>choose(option)}><span>{option.label}</span>{option.description&&<small>{option.description}</small>}{option.value===value&&<i>✓</i>}</button>)}</div>{!matches.length&&<p className="searchable-select-empty">Không có lựa chọn khớp “{query}”. Thử tên khác.</p>}</div>}
  </div>;
};
