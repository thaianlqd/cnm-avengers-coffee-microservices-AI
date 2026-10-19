"""Account identity and governed grants, separate from analytical geography.

The existing Identity issuer uses HS256 JWTs. This intentionally narrow adapter
accepts only that algorithm, signed expiring tokens and configured trust. Legacy
tokens without iss/aud require an explicit deployment opt-in. No user/issuer/key
discovery, credentials logging, or browser-asserted permissions are supported.
JWT claim validation follows RFC7519; HS256 key size follows RFC7518 section3.2.
"""
import base64
from dataclasses import dataclass, replace
from contextvars import ContextVar
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import time
import secrets

from fastapi import HTTPException

AUTH_COOKIE = 'analysis_auth'
POLICY_PATH = Path(__file__).resolve().parent.parent / 'metadata/access_policy.json'
_ID = re.compile(r'^[A-Za-z0-9_.:@/-]{1,256}$')
active_principal = ContextVar('analytics_principal', default=None)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate identity field')
        result[key] = value
    return result


def _decode(segment):
    if not isinstance(segment, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', segment):
        raise ValueError('Invalid signed token encoding')
    raw = base64.b64decode(segment + '=' * (-len(segment) % 4), altchars=b'-_', validate=True)
    if base64.urlsafe_b64encode(raw).rstrip(b'=').decode() != segment:
        raise ValueError('Noncanonical signed token encoding')
    return raw


def _date_claim(claims, name, required=False):
    value = claims.get(name)
    if value is None and not required:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Invalid token lifetime')
    return value


def verify_identity(token, *, secret, issuer=None, audience=None, allow_legacy=False, now=None):
    """Verify an existing issuer's token; never return bearer/credential data."""
    if not isinstance(secret, str) or len(secret.encode()) < 32:
        raise HTTPException(503, 'Xác thực tài khoản chưa được cấu hình an toàn.')
    try:
        if not isinstance(token, str) or len(token) > 16384:
            raise ValueError('Invalid token')
        header, payload, signature = token.split('.')
        parsed_header = json.loads(_decode(header).decode('utf-8'), object_pairs_hook=_unique_object)
        if (not isinstance(parsed_header, dict) or parsed_header.get('alg') != 'HS256'
                or parsed_header.get('typ', 'JWT') != 'JWT' or parsed_header.get('crit')
                or any(k not in {'alg', 'typ'} for k in parsed_header)):
            raise ValueError('Unsupported signed token header')
        expected = hmac.digest(secret.encode(), (header + '.' + payload).encode('ascii'), 'sha256')
        if not hmac.compare_digest(expected, _decode(signature)):
            raise ValueError('Invalid signature')
        claims = json.loads(_decode(payload).decode('utf-8'), object_pairs_hook=_unique_object)
        if not isinstance(claims, dict):
            raise ValueError('Invalid claims')
        instant = time.time() if now is None else now
        expiry = _date_claim(claims, 'exp', required=True)
        not_before = _date_claim(claims, 'nbf')
        issued = _date_claim(claims, 'iat')
        if expiry <= instant or (not_before is not None and not_before > instant) or (issued is not None and issued > instant):
            raise ValueError('Token outside validity interval')
        subject, role = claims.get('sub'), claims.get('role')
        if not isinstance(subject, str) or not _ID.fullmatch(subject) or not isinstance(role, str) or not _ID.fullmatch(role):
            raise ValueError('Account identity missing')
        if issuer:
            if claims.get('iss') != issuer:
                raise ValueError('Unexpected issuer')
        elif not allow_legacy:
            raise ValueError('Issuer trust not configured')
        if audience:
            audiences = claims.get('aud')
            if isinstance(audiences, str):
                audiences = [audiences]
            if not isinstance(audiences, list) or not all(isinstance(a, str) for a in audiences) or audience not in audiences:
                raise ValueError('Unexpected audience')
        elif not allow_legacy:
            raise ValueError('Audience trust not configured')
        return {'subject': subject, 'role': role, 'expires_at': expiry, 'issued_at': issued}
    except (ValueError, TypeError, UnicodeError, OverflowError, RecursionError):
        raise HTTPException(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
                            headers={'WWW-Authenticate': 'Bearer'}) from None


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str
    permissions: frozenset
    datasets: tuple
    store_ids: tuple
    national: bool
    policy_version: str
    access_fingerprint: str
    expires_at: float
    auth_session_key: str | None = None

    @property
    def owner_key(self):
        return 'account:' + hashlib.sha256(self.subject.encode()).hexdigest()

    def permits(self, permission, dataset=None):
        return permission in self.permissions and (dataset is None or '*' in self.datasets or dataset in self.datasets)

    @property
    def bound_owner(self):
        return self.owner_key+':'+self.access_fingerprint


def _strings(value, label):
    if not isinstance(value, list) or len(value) > 5000 or any(not isinstance(v, str) or not _ID.fullmatch(v) for v in value):
        raise ValueError('Invalid access policy ' + label)
    return tuple(sorted(set(value)))


def principal_for(identity, policy):
    """Only server-managed policy grants define access; token scope is ignored."""
    try:
        if not isinstance(policy, dict) or not isinstance(policy.get('version'), str) or not policy['version']:
            raise ValueError('Policy version missing')
        roles, subjects = policy.get('roles', {}), policy.get('subjects', {})
        if not isinstance(roles, dict) or not isinstance(subjects, dict):
            raise ValueError('Invalid access policy mappings')
        role = roles.get(identity['role'])
        if not isinstance(role, dict):
            raise HTTPException(403, 'Tài khoản chưa có quyền truy cập Data Platform.')
        subject = subjects.get(identity['subject'], {})
        if not isinstance(subject, dict) or subject.get('disabled'):
            raise HTTPException(403, 'Quyền truy cập tài khoản đã bị thu hồi.')
        grants = {**role, **subject}
        permissions = frozenset(_strings(grants.get('permissions', []), 'permissions'))
        datasets = tuple(sorted(set(grants.get('datasets', []))))
        if not isinstance(grants.get('datasets', []), list) or any(not isinstance(v, str) or v != '*' and not _ID.fullmatch(v) for v in datasets):
            raise ValueError('Invalid access policy datasets')
        stores = _strings(grants.get('store_ids', []), 'store_ids')
        national = grants.get('national', False)
        if not isinstance(national, bool):
            raise ValueError('Invalid access policy scope')
        fingerprint = digest({'policy': policy, 'subject': identity['subject'], 'role': identity['role'],
                              'effective_grants': grants})
        return Principal(subject=identity['subject'], role=identity['role'], permissions=permissions,
                         datasets=datasets, store_ids=stores, national=national, policy_version=policy['version'],
                         access_fingerprint=fingerprint, expires_at=identity['expires_at'])
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError):
        raise HTTPException(503, 'Chính sách truy cập chưa hợp lệ.') from None


def load_policy(path=None):
    try:
        source = Path(path or os.getenv('DATA_ANALYST_ACCESS_POLICY_PATH') or POLICY_PATH)
        if source.stat().st_size > 256000:
            raise ValueError('Policy exceeds capacity')
        return json.loads(source.read_text(encoding='utf-8'), object_pairs_hook=_unique_object)
    except (OSError, ValueError, UnicodeError):
        raise HTTPException(503, 'Chính sách truy cập chưa sẵn sàng.') from None


def require_permission(principal, permission, dataset=None):
    if principal is None:
        raise HTTPException(401, 'Vui lòng đăng nhập để tiếp tục.', headers={'WWW-Authenticate': 'Bearer'})
    if principal.expires_at <= time.time():
        raise HTTPException(401, 'Phiên đăng nhập đã hết hạn.', headers={'WWW-Authenticate': 'Bearer'})
    if not principal.permits(permission, dataset):
        raise HTTPException(403, 'Tài khoản không có quyền thực hiện thao tác này.')
    return principal


def request_principal(request):
    """Resolve current policy on every authenticated HTTP request, including pages/export."""
    header = request.headers.get('authorization', '')
    if header:
        if not header.startswith('Bearer ') or len(header.split()) != 2:
            raise HTTPException(401, 'Thông tin đăng nhập không hợp lệ.')
        token = header[7:]
    else:
        token = request.cookies.get(AUTH_COOKIE, '')
    if not token:
        raise HTTPException(401, 'Vui lòng đăng nhập để tiếp tục.', headers={'WWW-Authenticate': 'Bearer'})
    if not header and token.startswith('as_'):
        key = _auth_key(token)
        identity = _load_auth_identity(key)
        return replace(principal_for(identity, load_policy()), auth_session_key=key)
    identity = verify_identity(token, secret=os.getenv('DATA_ANALYST_IDENTITY_JWT_SECRET', ''),
                               issuer=os.getenv('DATA_ANALYST_IDENTITY_JWT_ISSUER') or None,
                               audience=os.getenv('DATA_ANALYST_IDENTITY_JWT_AUDIENCE') or None,
                               allow_legacy=os.getenv('DATA_ANALYST_AUTH_ALLOW_LEGACY_JWT') == '1')
    return principal_for(identity, load_policy())


def _auth_client():
    from services.session_service import storage
    store = storage()
    if store is None:
        raise HTTPException(503, 'Phiên đăng nhập cần kho Redis bền vững.')
    return store.client


def _auth_key(token):
    if not re.fullmatch(r'as_[a-f0-9]{64}', token):
        raise HTTPException(401, 'Phiên đăng nhập không hợp lệ.')
    return 'analyst:auth:' + hashlib.sha256(token.encode()).hexdigest()


def _load_auth_identity(key):
    try:
        raw = _auth_client().get(key)
        if not raw:
            raise HTTPException(401, 'Phiên đăng nhập đã hết hạn hoặc đã đăng xuất.')
        if len(raw) > 2048:
            raise ValueError()
        identity = json.loads(raw, object_pairs_hook=_unique_object)
        if (identity.get('source') != 'trusted_identity_login'
                or not isinstance(identity.get('subject'), str) or not _ID.fullmatch(identity['subject'])
                or not isinstance(identity.get('role'), str) or not _ID.fullmatch(identity['role'])
                or type(identity.get('expires_at')) not in {float,int} or identity['expires_at'] <= time.time()):
            raise HTTPException(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
        return identity
    except HTTPException: raise
    except Exception:
        raise HTTPException(503, 'Kho phiên đăng nhập chưa sẵn sàng.') from None


def create_identity_session(upstream):
    """Trust only an operator-pinned Identity login response after credentials.

    No client JWT/identity/grants are accepted by this path. Existing Identity
    authenticates the password; this API stores an opaque15minute Redis session,
    not the upstream JWT or password. Bearer JWT verification remains separate.
    """
    user = upstream.get('user') if isinstance(upstream, dict) else None
    if not isinstance(user, dict):
        raise HTTPException(503, 'Identity chưa trả về danh tính hợp lệ.')
    subject, role = user.get('ma_nguoi_dung'), user.get('vai_tro')
    if not isinstance(subject, str) or not _ID.fullmatch(subject) or not isinstance(role, str) or not _ID.fullmatch(role):
        raise HTTPException(503, 'Identity chưa trả về danh tính hợp lệ.')
    identity = {'subject':subject,'role':role,'expires_at':time.time()+900,'source':'trusted_identity_login'}
    principal = principal_for(identity, load_policy())
    opaque = 'as_' + secrets.token_hex(32)
    key = _auth_key(opaque)
    try:
        if not _auth_client().set(key, json.dumps(identity), ex=900, nx=True):
            raise ValueError()
    except Exception:
        raise HTTPException(503, 'Chưa lưu được phiên đăng nhập; vui lòng thử lại.') from None
    return opaque, replace(principal, auth_session_key=key)


def revoke_identity_session(request):
    token = request.cookies.get(AUTH_COOKIE, '')
    if token.startswith('as_'):
        try: _auth_client().delete(_auth_key(token))
        except HTTPException: raise
        except Exception: raise HTTPException(503, 'Chưa đăng xuất được phiên hiện tại.') from None


def development_fallback():
    return os.getenv('DATA_ANALYST_ENV','development') != 'production' and os.getenv('DATA_ANALYST_ALLOW_BROWSER_OWNER') == '1'


def current_principal(*, required=False):
    principal=active_principal.get()
    if principal is None:
        if required or not development_fallback():
            raise HTTPException(401,'Vui lòng đăng nhập để tiếp tục.')
        return None
    require_permission(principal,'analytics.read')
    if principal.auth_session_key:
        identity = _load_auth_identity(principal.auth_session_key)
        if identity['subject'] != principal.subject or identity['role'] != principal.role:
            raise HTTPException(401, 'Phiên đăng nhập không còn hợp lệ.')
    updated=principal_for({'subject':principal.subject,'role':principal.role,'expires_at':principal.expires_at},load_policy())
    if updated.access_fingerprint != principal.access_fingerprint:
        raise HTTPException(403,'Quyền truy cập đã thay đổi; vui lòng tải lại phiên phân tích.')
    return principal


def route_permission(path,method):
    if path.startswith('/api/system/') or path=='/api/reports/logs': return 'system.read'
    if path=='/api/platform/pipelines/trigger': return 'pipeline.trigger'
    if path=='/api/query' or path.startswith('/api/warehouse/'): return 'sql.explore'
    if 'export' in path or 'download-docx' in path: return 'reports.export'
    if path=='/api/reports/preview' or '/execute' in path or path.endswith('/run'): return 'sql.explore'
    if path.startswith('/api/reports/') and method!='GET': return 'reports.save'
    if path.startswith('/api/ai/modules') and method!='GET': return 'reports.save'
    if path.startswith('/api/platform/') or path=='/api/realtime-events': return 'platform.read'
    return 'analytics.read'


BI_DATASET_DEPENDENCIES = {
    '/api/marts/': ('silver.don_hang','silver.chi_tiet_don_hang','silver.chi_nhanh','silver.san_pham','silver.danh_muc'),
    '/api/products/': ('silver.don_hang','silver.chi_tiet_don_hang','silver.chi_nhanh','silver.san_pham','silver.danh_muc'),
    '/api/customers/': ('silver.don_hang','silver.chi_nhanh','silver.nguoi_dung'),
    '/api/stores/': ('silver.don_hang','silver.chi_nhanh'),
    '/api/platform/overview': ('silver.don_hang','silver.chi_nhanh','silver.san_pham'),
}


def authorize_route(principal,path,method):
    require_permission(principal,route_permission(path,method))
    # Legacy BI queries join multiple governed sources. A domain-level grant
    # alone must not expose another dataset through these aggregate endpoints.
    for prefix, dependencies in BI_DATASET_DEPENDENCIES.items():
        if path.startswith(prefix):
            for dataset in dependencies:require_permission(principal,'analytics.read',dataset)
    # These legacy BI surfaces have no safe branch-level mapping yet. Denying
    # them is intentional until a scoped adapter exists; never widen to global.
    scoped_prefix=('/api/products','/api/customers','/api/stores','/api/marts','/api/platform','/api/system','/api/warehouse')
    if not principal.national and (path.startswith(scoped_prefix) or path in
        {'/api/kpi','/api/revenue-trend','/api/top-products','/api/payment-methods','/api/branch-taste','/api/realtime-events','/api/query'}):
        raise HTTPException(403,'Luồng này chưa hỗ trợ phạm vi truy cập được cấp cho tài khoản.')
    dataset=next((name for prefix,name in (('/api/customers','customers'),('/api/products','products'),
        ('/api/stores','stores'),('/api/marts','orders')) if path.startswith(prefix)),None)
    if dataset: require_permission(principal,'analytics.read',dataset)


def csrf_origin(request):
    if request.method in {'GET','HEAD','OPTIONS'}: return
    if request.headers.get('authorization'): return
    if not request.cookies.get(AUTH_COOKIE): return
    origin=request.headers.get('origin','').rstrip('/')
    allowed={v.strip().rstrip('/') for v in os.getenv('DATA_ANALYST_ALLOWED_ORIGINS','').split(',') if v.strip() and v.strip()!='*'}
    allowed.add(str(request.base_url).rstrip('/'))
    if not origin or origin not in allowed:
        raise HTTPException(403,'Nguồn yêu cầu thay đổi dữ liệu không hợp lệ.')


def authorize_sql(sql):
    """Recheck dataset grants and add mandatory row restrictions at execution.

    Compiler validation still precedes this narrowing. No source other than a
    mapped Silver view can silently fall back to national scope.
    """
    principal=active_principal.get()
    if principal is None: return sql
    principal=current_principal(required=True)
    import sqlglot
    from sqlglot import exp
    tree=sqlglot.parse_one(sql,read='postgres')
    ctes={cte.alias_or_name for cte in tree.find_all(exp.CTE)}
    direct={'silver.don_hang':'co_so_ma','silver.chi_nhanh':'ma_chi_nhanh',
        'silver.ton_kho_san_pham':'co_so_ma','silver.danh_gia_chi_nhanh':'ma_chi_nhanh',
        'silver.ca_lam_viec_nhan_vien':'co_so_ma','silver.ca_doi_soat':'co_so_ma',
        'silver.khao_sat_phan_hoi':'co_so_ma','silver.khuyen_mai_su_dung':'co_so_ma'}
    through_order={'silver.chi_tiet_don_hang','silver.giao_dich_thanh_toan','silver.giao_hang','silver.danh_gia_san_pham'}
    neutral={'silver.san_pham','silver.danh_muc','silver.bien_the_san_pham','silver.khu_vuc'}
    tables=list(tree.find_all(exp.Table))
    metadata=json.loads((POLICY_PATH.parent/'semantic_catalog.json').read_text())['silver_tables']
    for table in tables:
        if not table.db and table.name in ctes: continue
        name=table.db+'.'+table.name
        require_permission(principal,'analytics.read',name)
        if not name.startswith('silver.'):
            raise HTTPException(403,'Nguồn truy vấn nằm ngoài các dataset phân tích được cấp.')
        if principal.national: continue
        if name in neutral: continue
        if not principal.store_ids or name not in direct and name not in through_order:
            raise HTTPException(403,'Dataset chưa có ánh xạ phạm vi truy cập an toàn.')
        values=', '.join(exp.Literal.string(value).sql(dialect='postgres') for value in principal.store_ids)
        if name in direct:
            predicate=direct[name]+' IN ('+values+')'
        else:
            require_permission(principal,'analytics.read','silver.don_hang')
            predicate='ma_don_hang IN (SELECT ma_don_hang FROM silver.don_hang WHERE co_so_ma IN ('+values+'))'
        alias=table.alias_or_name
        known=set(metadata.get(name,{}).get('columns',{}))
        needed=sorted({column.name for column in tree.find_all(exp.Column) if column.name in known
            and (not column.table or column.table in {alias,table.name})})
        projection=', '.join(exp.to_identifier(column,quoted=True).sql(dialect='postgres') for column in needed) or '1 AS __scope_row'
        replacement=sqlglot.parse_one('(SELECT '+projection+' FROM '+name+' WHERE '+predicate+') AS "'+alias.replace('"','""')+'"',read='postgres')
        # Three-part original column references now target the bounded alias.
        for column in list(tree.find_all(exp.Column)):
            if column.db==table.db and column.table==table.name:
                column.set('db',None)
                column.set('table',exp.to_identifier(alias))
        table.replace(replacement)
    return tree.sql(dialect='postgres')


def cache_identity():
    principal=active_principal.get()
    if principal is None:return 'legacy-internal'
    return current_principal(required=True).bound_owner


def project_tables(tables):
    if active_principal.get() is None:return tables
    principal=current_principal(required=True)
    return {name:value for name,value in tables.items() if principal.permits('analytics.read',name)}


def authorize_meaning(question,catalog,*,analysis_scope=None,anchors=None):
    """Known denied requests stop before provider; ambiguous ones stay pending.

    Reporting geography is not an entitlement. Until a trusted geo-to-assigned
    store mapping exists, scoped accounts explicitly select only granted IDs.
    """
    if active_principal.get() is None:return None
    principal=current_principal(required=True)
    if anchors is None:
        anchors={}
    for metric in anchors.get('metrics',[]):
        for identity in metric.get('candidate_ids',[]):
            definition=catalog.registry['metrics'].get(identity)
            if definition and not principal.permits('analytics.read',definition['source']):
                raise HTTPException(403,'Metric được yêu cầu chưa được cấp quyền cho tài khoản.')
    if not principal.national:
        if not principal.store_ids:raise HTTPException(403,'Tài khoản chưa được cấp phạm vi cửa hàng.')
        resolution=anchors.get('scope_resolution') or {}
        if resolution.get('state')=='explicit_all' or resolution.get('bindings'):
            raise HTTPException(403,'Phạm vi địa lý này chưa có ánh xạ quyền được cấp; hãy chọn mã cửa hàng được phép.')
        scope=analysis_scope.model_dump() if hasattr(analysis_scope,'model_dump') else analysis_scope or {}
        for selection in scope.get('filters',[]):
            values=selection['value'] if isinstance(selection['value'],list) else [selection['value']]
            if selection.get('dimension')!='store_id' or selection.get('operator') not in {'eq','in'} or not set(values)<=set(principal.store_ids):
                raise HTTPException(403,'Phạm vi yêu cầu vượt quyền truy cập được cấp.')
    return {'policy_version':principal.policy_version,'policy_fingerprint':principal.access_fingerprint,
            'scope':{'national':principal.national,'store_ids':list(principal.store_ids)},
            'description':'Phạm vi theo quyền tài khoản; không suy từ taxonomy địa lý báo cáo'}


class AccessMiddleware:
    """Default authenticated API boundary; public health and auth only.

    A ContextVar is copied into sync route workers and explicitly into the job
    executor. Recheck current grants before publishing any authenticated body.
    """
    def __init__(self,app): self.app=app

    async def __call__(self,scope,receive,send):
        if scope['type']!='http': return await self.app(scope,receive,send)
        from starlette.requests import Request
        from starlette.responses import JSONResponse
        path,method=scope.get('path',''),scope.get('method','GET')
        public={'/health','/api/health','/liveness','/api/readiness','/api/auth/login','/api/auth/session','/api/auth/logout'}
        if not path.startswith('/api/') or path in public or method=='OPTIONS':
            return await self.app(scope,receive,send)
        request=Request(scope)
        token=None
        try:
            if development_fallback() and not request.headers.get('authorization') and not request.cookies.get(AUTH_COOKIE):
                return await self.app(scope,receive,send)
            csrf_origin(request)
            principal=request_principal(request)
            authorize_route(principal,path,method)
            scope.setdefault('state',{})['principal']=principal
            token=active_principal.set(principal)
            async def guarded_send(message):
                if message['type']=='http.response.start':
                    current_principal(required=True)
                await send(message)
            await self.app(scope,receive,guarded_send)
        except HTTPException as error:
            await JSONResponse({'detail':error.detail},status_code=error.status_code,headers=error.headers)(scope,receive,send)
        finally:
            if token is not None: active_principal.reset(token)
