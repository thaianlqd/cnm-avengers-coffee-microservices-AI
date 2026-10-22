import {useTranslation} from 'react-i18next';
import i18n from '../i18n';
import copy from '../locales/ui.en.tsv?raw';
const normalize=value=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
const translations=new Map(copy.trim().split('\n').map(line=>{const [vi,...en]=line.split('\t');return [normalize(vi),en.join('\t')];}));
function collect(vi,en){for(const [key,value] of Object.entries(vi||{})){if(typeof value==='string'&&typeof en?.[key]==='string')translations.set(normalize(value),en[key]);else if(value&&typeof value==='object')collect(value,en?.[key]);}}
collect(i18n.getResourceBundle('vi','translation'),i18n.getResourceBundle('en','translation'));
export function useUiLanguage(){return useTranslation().i18n.resolvedLanguage || 'vi';}
export function uiText(source,values={}) {
 if(typeof source!=='string')return source;
 const english=(i18n.resolvedLanguage||i18n.language||'vi').startsWith('en');
 let result=english ? translations.get(normalize(source)) || source : source;
 if(result.trim().length > 7 && result.trim() === result.trim().toUpperCase() && /[A-ZÀ-Ỹ]/.test(result)) { const value=result.trim(); result=value[0]+value.slice(1).toLocaleLowerCase(english ? 'en' : 'vi'); }
 if(english && result!==source) result=(source.match(/^\s*/)?.[0]||'')+result+(source.match(/\s*$/)?.[0]||'');
 return result.replace(/\{\{(\w+)\}\}/g,(_,key)=>String(values[key]??''));
}

export const uiLocale=()=> (i18n.resolvedLanguage||i18n.language||'vi').startsWith('en') ? 'en-GB' : 'vi-VN';
