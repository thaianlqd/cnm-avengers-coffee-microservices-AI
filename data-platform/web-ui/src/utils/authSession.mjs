// Account identity stays in memory. The server keeps credentials in HttpOnly cookies.
let accountIdentity = null;
export function setAccountIdentity(value) { accountIdentity = value || null; }
export function getAccountIdentity() { return accountIdentity; }
export function decodeAuthSession(value) {
  if (!value || typeof value !== 'object') throw new Error('Phiên đăng nhập chưa hợp lệ.');
  if (value.mode === 'explicit_development_browser' && value.identity === 'development-browser') return value;
  if (value.authenticated !== true || typeof value.identity !== 'string' || value.identity.length > 220
      || !Array.isArray(value.permissions) || !value.permissions.every(p => typeof p === 'string')
      || typeof value.expires_at !== 'number' || !Number.isFinite(value.expires_at)) {
    throw new Error('Phiên đăng nhập chưa hợp lệ.');
  }
  return value;
}

export function accountStorageKey(base, identity) {
  return identity ? `${base}:${identity}` : `${base}:unassigned`;
}

export function shouldExpireSession(response, url) {
  return response.status === 401 && typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/');
}

// Drafts are memory-only and keyed by the full account/policy identity. No
// report, bearer, or password is retained. Explicit logout clears this slot.
let draftSlot = null;
export function rememberAnalysisDraft(identity, draft) {
  if (!identity || !draft || typeof draft.question !== 'string' || draft.question.length > 8000) return;
  const serialized=JSON.stringify(draft);
  if(serialized.length > 24000)return;
  draftSlot={identity,draft:JSON.parse(serialized)};
}
export function readAnalysisDraft(identity) {
  return identity && draftSlot?.identity===identity ? JSON.parse(JSON.stringify(draftSlot.draft)) : null;
}
export function clearAnalysisDraft() {draftSlot=null;}
export function retainAnalysisDraft(identity) {if(draftSlot?.identity!==identity)draftSlot=null;}
