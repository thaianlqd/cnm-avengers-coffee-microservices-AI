"""Input constraints, not an intent planner. No I/O on the typing path.

Keep explicit unknown values separate from absent scope. Named slots derive
from catalog types/aliases; only bounded, authorized lookup may resolve a name
missing from the local evidence. Never fuzzy-bind an unknown value.
"""
from datetime import date
from decimal import Decimal,InvalidOperation
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
from threading import Lock
import time
import unicodedata

from services.analysis_catalog import AnalysisError
from services.value_grounding_service import aliases_for, dimension_values, value_text

POLICY_PATH = Path(__file__).resolve().parents[1] / 'metadata' / 'input_integrity_policy.json'
_cache = {}
_cache_lock = Lock()
_lookup_limiter = None
_lookup_limiter_lock = Lock()


@lru_cache(maxsize=4)
def _policy(stamp):
    return json.loads(POLICY_PATH.read_text())


def policy():
    return _policy(POLICY_PATH.stat().st_mtime_ns)


def policy_fingerprint():
    return hashlib.sha256(json.dumps(policy(),sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def request_text(request):
    """All user-authored semantic fields share the same intake boundary.

    A clean main question cannot authorize an unresolved restriction hidden
    in a legacy context or in the natural-input expectation fields.
    """
    main=getattr(request,'prompt',getattr(request,'question','')) or ''
    return '\n'.join([main,*[str(getattr(request,name)) for name in
        ('analysis_context','analysis_expectation','context') if getattr(request,name,None)]])


def _pattern(phrases):
    return r'(?<!\w)(?:' + '|'.join(re.escape(value_text(p)) for p in sorted(phrases, key=len, reverse=True) if value_text(p)) + r')(?!\w)'


@lru_cache(maxsize=8)
def _vocabulary(catalog, policy_stamp):
    from services.preflight_service import _accent_text
    p = _policy(policy_stamp)
    heads = {}
    literal_heads = set()
    spellings = {}
    values = {}
    groups = {}
    for name, d in catalog.registry['dimensions'].items():
        values[name] = aliases_for(catalog,name,dimension_values(catalog,name))
        if d.get('scope_governed'):
            groups.update({value_text(a):set(g['values']) for g in d.get('value_groups',[]) for a in g['aliases']})
        if name in p['non_entity_dimensions'] or d.get('lifecycle',{}).get('status')=='deprecated':continue
        if (d.get('value_grounding') or {}).get('mode') not in {'enum','lookup'} and name not in p['heads']:continue
        for alias in [d['business_name'],*d.get('aliases',[]),*p['heads'].get(name,[])]:
            if len(value_text(alias))>2:
                heads.setdefault(value_text(alias),set()).add(name)
                literal_heads.add(value_text(alias))
                spellings.setdefault(value_text(alias),set()).add(_accent_text(alias))
            for qualifier in p['postposed_head_qualifiers']:
                q=value_text(qualifier);a=value_text(alias)
                if a.startswith(q+' '):
                    derived=a[len(q)+1:]+' '+q
                    heads.setdefault(derived,set()).add(name)
                    spellings.setdefault(derived,set()).add(_accent_text(alias[len(qualifier):].strip()+' '+qualifier))
    business_phrases={value_text(a):{id} for id,d in catalog.registry['subjects'].items()
        for a in [d['business_name'],*d.get('aliases',[])]}
    for concept in catalog.registry.get('domain_intelligence',{}).get('topic_concepts',[]):
        for a in concept.get('terms',[])+concept.get('evaluative_objects',[]):
            business_phrases.setdefault(value_text(a),set()).add(concept['id'])
    return heads,values,groups,literal_heads,spellings,business_phrases


def entity_lookup(catalog, *, resolve=False):
    """Owner/access/catalog/policy-bound cache. Only explicit actions may use I/O.

    Missing cache returns None, not an empty successful search. There are no
    client assertions or globally shared resolved names in this boundary.
    """
    from services.access_policy import active_principal
    principal = active_principal.get()
    def unavailable(category,message,queries=0):
        error=AnalysisError(category,message)
        error.lookup_queries=queries
        return error
    def lookup(name, search):
        if principal is None:
            return None
        d = catalog.registry['dimensions'][name]
        try:catalog.check_column(d['table'], d['column'])
        except AnalysisError:raise unavailable('privacy','Trường dữ liệu không nằm trong phạm vi được cấp.') from None
        if not principal.permits('analytics.read', d['table']):
            raise unavailable('privacy', 'Tên cần kiểm tra nằm ngoài dữ liệu được cấp quyền.')
        key = (principal.owner_key, principal.access_fingerprint, principal.national, principal.store_ids, principal.datasets, catalog.fingerprint,
               policy_fingerprint(), name, value_text(search))
        now = time.monotonic()
        with _cache_lock:
            cached = _cache.get(key)
            if cached and now-cached[0] < policy()['lookup_ttl_seconds'] and (not resolve or any(value_text(v)==value_text(search) for v in cached[1])):
                return {'values':cached[1], 'queries':0}
        if not resolve: return None
        if not 2 <= len(search.strip()) <= 80:
            return {'values':[], 'queries':0}
        # Scoped users must not probe other stores or global entity values.
        if not principal.national:
            if name != 'store_id':
                raise unavailable('query_scope', 'Chọn mã cửa hàng trong phạm vi được cấp để xác minh tên.')
            values = [v for v in principal.store_ids if value_text(v) == value_text(search)]
            queries = 0
        else:
            # The same bound applies to direct POST/propose/job paths, before
            # admission/cache, not only the dedicated resolve button endpoint.
            global _lookup_limiter
            from services.preflight_service import RateLimiter
            with _lookup_limiter_lock:
                if _lookup_limiter is None:
                    _lookup_limiter=RateLimiter(requests=policy()['max_lookup_queries_per_minute'],window_seconds=60)
            if not _lookup_limiter.allow(principal.owner_key):
                raise unavailable('metadata','Đã đạt giới hạn tra cứu tên. Vui lòng thử lại sau.')
            from services.metadata_service import lookup_dimension_values
            try:
                values = lookup_dimension_values(d['table'], d['column'], search, limit=8)
            except Exception:
                raise unavailable('metadata', 'Tra cứu tên tạm thời không khả dụng.',1) from None
            queries = 1
        with _cache_lock:
            # Bounded cache also discards expired evidence; never changes grants.
            for old in list(_cache):
                if now-_cache[old][0] >= policy()['lookup_ttl_seconds']: _cache.pop(old, None)
            if len(_cache) >= 1024: _cache.pop(next(iter(_cache)))
            _cache[key] = (now, list(values))
        return {'values':values, 'queries':queries}
    return lookup


def validate(question, catalog, *, anchors=None, lookup=None, context=None):
    # Import lazily: preflight itself reuses this validator.
    from services.preflight_service import mapped_text
    from services.request_anchors import request_anchors, exact_mentions
    p = policy()
    lookup = lookup or entity_lookup(catalog)
    text, indices = mapped_text(question or '')
    anchors = anchors if anchors is not None else request_anchors(question, catalog, {})
    definitions = catalog.registry['dimensions']
    heads,vocabularies,scope_groups,literal_heads,spellings,business_phrases = _vocabulary(catalog,POLICY_PATH.stat().st_mtime_ns)
    protected_values = [v for name in {v['dimension'] for v in anchors.get('values',[])}
        for v in exact_mentions(text,{a:{str(b)} for a,b in vocabularies[name].items()})]
    literal_ranges=[(indices[v['start']],indices[v['end']-1]+1) for v in protected_values]
    for quoted_name in re.finditer(r'["“]([^"”\n]{1,100})["”]',question):
        if re.search(_pattern(list(heads))+r'\s*$',value_text(question[:quoted_name.start()])):
            literal_ranges.append(quoted_name.span(1))
    def literal(start,end):return any(a<=start and end<=b for a,b in literal_ranges)
    slots = []
    lookup_count = 0
    lookup_attempts = 0
    numeric_filters=[]
    numeric_ends=[]

    def add(kind, start, end, state, reason, **extra):
        start = min(max(start, 0), len(indices))
        end = min(max(end, start), len(indices))
        raw_start = indices[start] if start < len(indices) else len(question)
        raw_end = indices[end-1]+1 if end > start else raw_start
        while raw_end<len(question) and unicodedata.combining(question[raw_end]):raw_end+=1
        slots.append(dict(id=f's{len(slots)+1}', kind=kind, state=state, reason=reason,
                          start=raw_start, end=raw_end, raw=question[raw_start:raw_end], **extra))

    from services.preflight_service import _subject_hits
    content = any(anchors.get(k) for k in ('metrics','dimensions','values','features','capabilities','granularities','times','rankings','forecasts')) or bool(_subject_hits(question,catalog.registry))
    mission_aliases=[a for m in catalog.registry.get('analysis_missions',[]) for a in
        [m.get('label',''),*m.get('aliases',[]),*m.get('input_contract',{}).get('intent_vocabulary',[])]]
    content=content or bool(re.search(_pattern(mission_aliases),text))
    business = catalog.registry.get('workspace',{}).get('business_signal_vocabulary',[])
    presentation = p['refinement_presentation_terms'] if (context or {}).get('mode')=='refinement' else []
    if not content and not re.search(_pattern(business+presentation),text):
        add('residual',0,len(text),'PRESENT_UNRESOLVED','input_residual_unresolved',label='Yêu cầu')
    # Analysis is READ ONLY: an imperative write request is not an analytical
    # question, whatever metric words it contains.
    for m in re.finditer(r'(?:^|[;.!?\n])\s*(?:'+_pattern(['hãy','giúp tôi','giúp','vui lòng','làm ơn','please'])+r'\s+)?'+_pattern(p.get('data_mutation_verbs',[])),text):
        add('mutation',m.start(),len(text),'INVALID','input_write_unsupported',label='Yêu cầu ghi dữ liệu')
    for i,ch in enumerate(question):
        if ch=='\u200d' and 0<i<len(question)-1 and all(unicodedata.category(c) in {'So','Sk','Mn'} for c in (question[i-1],question[i+1])):
            continue  # Joiners within emoji sequences are ordinary decoration.
        if unicodedata.category(ch) in {'Cf','Cc'} and ch not in '\t\n\r':
            add('control',sum(x<i for x in indices),sum(x<=i for x in indices),'INVALID','input_control_invalid',label='Ký tự điều khiển')

    # Read numbers from the original string: punctuation normalization must not
    # turn Top -5 into Top 5, or discard invalid calendar literals.
    raw = question.lower()
    for m in re.finditer(r'\b(?:top|bottom)\s*([+−–—﹣－-]?\s*(?:\d[^\s;]*|nan\b|inf(?:inity)?\b|∞))', raw):
        if literal(m.start(),m.end()):continue
        number = m[1].replace(' ', '').translate(str.maketrans('−–—﹣－','-----')).rstrip(',.;:?!').replace(',', '.')
        try:
            n = Decimal(number)
            valid = bool(re.fullmatch(r'[+-]?\d+(?:\.\d+)?',number)) and n.is_finite() and n==n.to_integral_value() and 1<=n<=p['max_top_n']
        except InvalidOperation:valid=False
        if not valid:
            a = sum(i < m.start() for i in indices); b = sum(i < m.end() for i in indices)
            add('ranking', a, b, 'INVALID', 'input_number_invalid', label='Top/Bottom N')
    def numeric_condition(start,end,prefix,operator,operand,explicit=True):
        if literal(start,end):return
        operand=(operand or '').strip().rstrip(',.;:?!').replace(' ','')
        numeric_targets={name:d for name,d in definitions.items() if (d.get('value_grounding') or {}).get('mode')=='literal' and d.get('lifecycle',{}).get('status')!='deprecated'}
        dimensions=[name for name,d in numeric_targets.items() if any(prefix.endswith(value_text(a)) for a in [d['business_name'],*d.get('aliases',[])])]
        metrics=[name for name,d in catalog.registry['metrics'].items() if any(prefix.endswith(value_text(a)) for a in [d['business_name'],*d.get('aliases',[])])]
        a=sum(i<start for i in indices);b=sum(i<end for i in indices)
        if not (dimensions or metrics):
            if not explicit:return
            add('condition',a,b,'PRESENT_UNRESOLVED','input_condition_unsupported',label='Đối tượng điều kiện');return
        if not re.fullmatch(r'[+−-]?\d+(?:[.,]\d+)*(?:%|k|tr|m|đ|vnd)?',operand or '',re.I):
            add('number',a,b,'INVALID','input_number_invalid',label='Điều kiện số');return
        if sum(c.isdecimal() for c in operand)>p['max_numeric_digits']:
            add('number',a,b,'INVALID','input_number_invalid',label='Độ lớn điều kiện số');return
        if len(dimensions)!=1:
            # Metric/HAVING predicates cannot be silently rewritten as a
            # row-amount WHERE filter. This intent contract has no HAVING.
            add('condition',a,b,'PRESENT_UNRESOLVED','input_condition_unsupported',label='Ngưỡng chỉ số tổng hợp');return
        if not re.fullmatch(r'[+−-]?\d+(?:[.,]\d{1,2})?',operand):
            add('number',a,b,'PRESENT_UNRESOLVED','input_number_ambiguous',label='Giá trị và đơn vị');return
        number=Decimal(operand.replace('−','-').replace(',','.'))
        value=int(number) if number==number.to_integral_value() else float(number)
        if any(f['dimension']==dimensions[0] for f in numeric_filters) or (numeric_ends and value_text(question[numeric_ends[-1]:start])=='hoac'):
            add('condition',a,b,'PRESENT_UNRESOLVED','input_condition_unsupported',label='Kết hợp điều kiện');return
        numeric_filters.append(dict(dimension=dimensions[0],operator=operator,value=value))
        numeric_ends.append(end)
        add('number',a,b,'BOUND','typed_numeric_filter',dimension=dimensions[0],label=numeric_targets[dimensions[0]]['business_name'],candidates=[value],operator=operator)
    for m in re.finditer(r'(>=|<=|>|<|≥|≤)\s*([^\s;]+)?', raw):
        numeric_condition(m.start(),m.end(),value_text(question[:m.start()]),{'≥':'gte','≤':'lte','>':'gt','<':'lt','>=':'gte','<=':'lte'}[m[1]],m[2])
    relation_vocab={value_text(a):op for a,op in p['numeric_comparisons'].items()}
    for m in re.finditer(_pattern(p['change_thresholds'])+r'\s+[+−-]?\s*\d+(?:[.,]\d+)?\s*%?',text):
        add('condition',m.start(),m.end(),'PRESENT_UNRESOLVED','input_condition_unsupported',label='Ngưỡng biến động và kỳ gốc')
    for m in re.finditer(_pattern(list(relation_vocab))+r'\s+([^\s;]+)',text):
        if any(h['start']<=m.start()<h['end'] for h in exact_mentions(text,heads)):continue
        if re.match(_pattern(p['refinement_presentation_terms']),text[m.start(1):]):continue
        if m[0].split()[0] in {'tren','duoi'} and re.match(_pattern(p['population_terms']),text[m.start(1):]):continue
        # Recover signs/decimal punctuation from the source, not folded text.
        raw_start=indices[m.start()];word_end=indices[m.start(1)-1]
        operand=re.match(r'\s*([+−-]?\s*[^\s;]+)',question[word_end:])
        if operand:numeric_condition(raw_start,word_end+operand.end(),text[:m.start()].strip(),relation_vocab[text[m.start():m.start(1)].strip()],operand[1],False)
    from services.analysis_catalog import normalize
    signed_text = normalize(question)
    for m in re.finditer(r'\b(?:thang|quy)\s*[-−+]\s*\d+\b', signed_text):
        # No span guess from normalized punctuation: recover using source index.
        add('time', sum(i < m.start() for i in indices), sum(i < m.end() for i in indices), 'INVALID', 'input_time_invalid', label='Thời gian')
    for m in re.finditer(r'\b(thang|quy)\s+([+-]?\d+)\b', text):
        if literal(indices[m.start()],indices[m.end()-1]+1):continue
        n = int(m[2]); maximum = 12 if m[1] == 'thang' else 4
        # A duration "13 tháng tới" has its number BEFORE the unit.
        if not 1 <= n <= maximum:
            add('time', m.start(), m.end(), 'INVALID', 'input_time_invalid', label='Thời gian')
    relative_time=list(re.finditer(_pattern(list(catalog.registry['interpretation'].get('time_aliases',{}))),text))
    for m in re.finditer(r'\b(?:thang|quy|nam)\s+([a-z]+)\b',text):
        if re.match(_pattern(p['non_calendar_phrases']),text[m.start():]):continue
        unit=text[m.start():m.start(1)].strip()
        raw_end=indices[m.start()+len(unit)-1]+1
        while raw_end<len(question) and unicodedata.combining(question[raw_end]):raw_end+=1
        from services.preflight_service import _accent_text
        spelled=_accent_text(question[indices[m.start()]:raw_end])
        if spelled!=value_text(spelled) and spelled!={'thang':'tháng','quy':'quý','nam':'năm'}[unit]:continue
        if any(a['start']<=m.start()<a['end'] for a in anchors.get('metrics',[])):continue
        if literal(indices[m.start()],indices[m.end()-1]+1):continue
        if any(v['start']<=m.start()<v['end'] for v in exact_mentions(text,scope_groups)):continue
        if any(a.start()<=m.start()<a.end() for a in relative_time):continue
        if re.search(_pattern(p['grouping'])+r'\s*$',text[:m.start()]) or re.search(r'\d+\s*$',text[:m.start()]):continue
        add('time',m.start(),m.end(),'PRESENT_UNRESOLVED','input_time_unresolved',label='Thời gian')
    dates=[]
    for m in re.finditer(r'(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)|(?<!\d)(\d{1,2})/(\d{1,2})/(\d{4})(?!\d)', raw):
        if literal(m.start(),m.end()):continue
        try:
            dates.append((m, date(*map(int, m.groups()[:3] if m[1] else (m[6], m[5], m[4])))))
        except ValueError:
            add('time', sum(i < m.start() for i in indices), sum(i < m.end() for i in indices),
                'INVALID', 'input_time_invalid', label='Ngày tháng')
    if len(dates)==2 and re.search(r'\btu\b', value_text(raw[:dates[0][0].start()])) and re.search(r'\bden\b',value_text(raw[dates[0][0].end():dates[1][0].start()])) and dates[0][1]>dates[1][1]:
        add('time',sum(i < dates[0][0].start() for i in indices),sum(i < dates[1][0].end() for i in indices),'INVALID','input_time_invalid',label='Khoảng thời gian')
    periods = list(re.finditer(r'\bthang\s+(\d{1,2})(?:\s+nam)?\s+(\d{4})\b', text))
    if len({m.groups() for m in periods}) > 1 and not re.search(r'\b(?:so sanh|so voi|va|voi|tu|den|hay|hoac)\b', text):
        add('time', periods[0].start(), periods[-1].end(), 'CONFLICT', 'input_time_conflict', label='Kỳ thời gian')

    head_mentions = exact_mentions(text, heads)
    head_mentions = [h for h in head_mentions if h['phrase'] in literal_heads or not any(
        other['phrase'] in literal_heads and set(h['candidate_ids'])==set(other['candidate_ids'])
        and other['start']<h['end'] and h['start']<other['end'] for other in head_mentions)]
    business_mentions=exact_mentions(text,business_phrases)
    def different_spelling(start,end,expected):
        from services.preflight_service import _accent_text
        raw=_accent_text(question[indices[start]:indices[end-1]+1])
        return raw!=value_text(raw) and raw not in expected
    head_mentions=[h for h in head_mentions if not different_spelling(h['start'],h['end'],spellings.get(h['phrase'],{h['phrase']}))]
    head_mentions=[h for h in head_mentions if not any(v['start']<=h['start'] and h['end']<=v['end'] for v in protected_values)]
    # A union/exclusion continues the same slot even without repeating its
    # noun: "Hà Nội và <unknown>" must not silently keep only Hà Nội.
    for name in {v['dimension'] for v in anchors.get('values',[])}:
        d=definitions[name]
        if d.get('filter_anchor') is False or name in p['non_entity_dimensions']: continue
        vocab = vocabularies[name]
        for v in exact_mentions(text, {a:{str(b)} for a,b in vocab.items()}):
            suffix = text[v['end']:]
            if re.match(r'\s*' + _pattern(p['value_connectors']), suffix):
                head_mentions.append(dict(start=v['end'], end=v['end'], candidate_ids=[name], continuation=True))
    quoted = [(sum(i < m.start(1) for i in indices), sum(i < m.end(1) for i in indices))
              for m in re.finditer(r'["“]([^"”\n]{1,100})["”]', question)]
    non_locations=list(re.finditer(_pattern(p['non_location_phrases']),text))
    boundaries = [b for b in re.finditer(_pattern(p['clause_boundaries'] + ['tại', 'ở']), text)
        if not any(a<=b.start()<z for a,z in quoted)
        and not any(m.start()<=b.start()<m.end() for m in non_locations)
        and (b[0] not in {'nam','thang','quy','tuan','ngay'} or re.match(r'\s+(?:\d|toi\b|truoc\b|nay\b|gan\b|sau\b)',text[b.end():]))]
    # Sentence and parenthetical boundaries survive mapped_text punctuation
    # folding. Decimal numbers and abbreviations (TP.HCM) stay intact.
    punctuation = [sum(i<m.start() for i in indices) for m in re.finditer(r'[;!?()\n]|\.(?=\s|$)',question)
                   if not any(a<=m.start()<b for a,b in literal_ranges)]
    def clause_end(start):
        return min([b.start() for b in boundaries if b.start()>=start]+[i for i in punctuation if i>=start]+[len(text)])
    other_scope_starts = [v['start'] for v in exact_mentions(text,scope_groups)]
    # Location syntax without a typed head still declares a restriction. An
    # uncached/unknown name cannot disappear just because its noun was omitted.
    for marker in re.finditer(_pattern(['tại','ở','lọc']),text):
        if any(m.start()<=marker.start()<m.end() for m in non_locations):continue
        if any(v['start']<=marker.start()<v['end'] for v in anchors.get('metrics',[])):continue
        if any(v['start']<=marker.start()<v['end'] for v in protected_values+business_mentions):continue
        if different_spelling(marker.start(),marker.end(),{'tại','ở','lọc'}):continue
        start=marker.end()
        while start<len(text) and text[start]==' ':start+=1
        if any(h['start']==start for h in head_mentions):continue
        if re.match(r'(?:theo|pham vi)\b',text[start:]) or re.match(_pattern(p['population_terms']),text[start:]):continue
        if any(a['start']==start for k in ('metrics','dimensions') for a in anchors.get(k,[])):continue
        if any(text[start:]==alias or text[start:].startswith(alias+' ') for vocabulary in vocabularies.values() for alias in vocabulary):continue
        if start in other_scope_starts:continue
        end=clause_end(start)
        if any(v['start']==start and not text[v['end']:end].strip() for v in business_mentions):continue
        add('entity',start,end,'PRESENT_UNRESOLVED','input_entity_unresolved' if end>start else 'input_value_missing',label='Địa điểm/đối tượng')
    for marker in re.finditer(_pattern(['nhóm theo','group by']),text):
        start=marker.end()
        while start<len(text) and text[start]==' ':start+=1
        if any(h['start']==start for h in head_mentions) or any(a['start']==start for a in anchors.get('dimensions',[])):continue
        end=min([b.start() for b in boundaries if b.start()>start]+[len(text)])
        add('dimension',start,end,'PRESENT_UNRESOLVED','input_entity_unresolved',label='Chiều phân tích')
    connectors = re.compile(_pattern(p['value_connectors']))
    # Entity values can themselves contain words such as "và" or "Tháng".
    # Longest exact governed names win before any clause splitting.
    for h in head_mentions:
        if len(h['candidate_ids']) != 1:
            continue  # A generic overloaded head remains the existing planner's clarification.
        name = h['candidate_ids'][0]
        d = definitions[name]
        if any(v['start']<=h['start'] and h['end']<v['end'] for v in protected_values):continue
        if any(v['start']<=h['start'] and h['end']<v['end'] for v in business_mentions):continue
        if any(a['start'] <= h['start'] and h['end'] < a['end'] for a in anchors.get('metrics', [])):
            continue
        # A head at the end of a metric can still introduce a named entity:
        # "doanh thu chi nhánh <name>". Only the governed forecast horizon
        # immediately following the complete metric is syntax, not a name.
        horizon_grammar = catalog.registry.get('workspace', {}).get('forecast_horizon_grammar')
        if anchors.get('forecasts') and horizon_grammar and any(
                a['start'] <= h['start'] and h['end'] == a['end'] for a in anchors.get('metrics', [])):
            if re.match(r'\s*(?:' + horizon_grammar + ')', text[h['end']:]):
                continue
        prefix = text[:h['start']]
        group = re.search(_pattern(p['grouping']) + r'\s*(?:\d+\s*)?$', prefix)
        explicit = re.search(_pattern(p['scope_introducers']) + r'\s*$', prefix)
        vocabulary = vocabularies[name]
        # A complete value like "kiosk nhượng quyền" contains the store head.
        value_spans = exact_mentions(text, {a:{str(v)} for a,v in vocabulary.items()})
        if any(v['start'] <= h['start'] and h['end'] < v['end'] for v in value_spans):
            continue
        start = h['end']
        while start < len(text) and text[start] == ' ': start += 1
        # "5 tỉnh này", "hai thành phố trên": a demonstrative refers back to an
        # already stated set; it is not a new entity name.
        if any(r['dimension']==name and r['start']==h['start'] for r in anchors.get('cohort_references',[])) and \
                not any(v['start'] == start for v in protected_values):
            continue
        assignment=re.match(_pattern(p['value_assignment_terms']),text[start:])
        if assignment:
            start+=assignment.end()
            while start<len(text) and text[start]==' ':start+=1
        end = min([clause_end(start)] +
                  [a for a in other_scope_starts if a >= start] +
                  [x['start'] for x in head_mentions if x['start'] > h['end']] +
                  [x['start'] for x in anchors.get('metrics', []) if x['start'] >= start] + [len(text)])
        # Full cached entity name can cross lexical boundary words.
        exact = next((v for v in value_spans if v['start'] == start), None)
        if exact: end = max(end, exact['end'])
        tail = text[start:end].strip()
        if not explicit and presentation and re.match(_pattern(presentation),text[start:]):continue
        # A dimension noun may introduce an instruction or another analytic
        # population, rather than an entity name. Only unquoted, non-filter
        # grammar takes this branch; explicit unknown filters remain required.
        if not explicit and (re.match(_pattern(p['clause_predicates']+p['population_terms']),tail)):
            continue
        connector=connectors.match(text,start,end)
        if not explicit and connector:
            next_start=connector.end()
            while next_start<end and text[next_start]==' ':next_start+=1
            if any(v['start']==next_start for v in business_mentions+anchors.get('metrics',[])+anchors.get('dimensions',[])):continue
        if group and any(alias.startswith(text[h['start']:end].strip()+' ') for alias in heads):continue
        if not explicit and re.fullmatch(_pattern(p['value_connectors'])+r'\s+'+_pattern(p['aggregate_prefixes']),tail) and any(m['start']==end for m in anchors.get('metrics',[])):
            continue  # A new analytical clause follows, not a voucher/store name.
        if not tail:
            if explicit:
                add('entity', h['start'], h['end'], 'PRESENT_UNRESOLVED', 'input_value_missing', dimension=name, label=d['business_name'])
            continue
        # Group axes have no named-value obligation ("theo tỉnh", "top 5 chi nhánh").
        # A named restriction after an axis still must be checked.
        if group and (not tail or tail in {'cao nhat', 'thap nhat', 'hang dau', 'hien tai', 'trong du lieu'}):
            continue
        # Noun phrases referring to a capability/population are not named values.
        if not explicit and re.match(r'^(?:nao|co\b|khong\b|da\b|chua\b|moi\b|duoc\b|can\b|hien\b|dang\b|tot\b|cao\b|thap\b|ban\b|theo\b)', tail):
            continue
        pieces = []
        cursor = start
        for c in connectors.finditer(text, start, end):
            if any(v['start'] <= c.start() and c.end() <= v['end'] for v in value_spans): continue
            pieces.append((cursor, c.start())); cursor = c.end()
        pieces.append((cursor, end))
        if cursor==end and pieces and re.search(r'\b(?:va|hoac|tru|ngoai tru|loai tru)\s*$', text[start:end]):
            add('entity', max(start,end-4), end, 'PRESENT_UNRESOLVED','input_value_missing',dimension=name,label=d['business_name'])
        for a,b in pieces:
            while a < b and text[a] == ' ': a += 1
            while b > a and text[b-1] == ' ': b -= 1
            if a == b: continue
            needle = text[a:b]
            if needle in {value_text(v) for v in p['selection_qualifiers']} and not any(x<=a and b<=z for x,z in quoted):continue
            if not explicit and re.match(_pattern(p['clause_predicates']+p['population_terms']),needle):continue
            canonical = vocabulary.get(needle)
            state, reason = ('BOUND', 'catalog_alias') if canonical is not None else ('PRESENT_UNRESOLVED', 'input_entity_unresolved')
            mode = (d.get('value_grounding') or {}).get('mode')
            if canonical is None and mode == 'lookup':
                reason = 'input_lookup_required'
                if lookup and lookup_attempts < p['max_lookup_slots']:
                    lookup_attempts += 1
                    lookup_count += 1
                    try:
                        evidence = lookup(name, question[indices[a]:indices[b-1]+1])
                        if evidence is None:
                            lookup_count -= 1
                            add('entity', a, b, state, reason, dimension=name, label=d['business_name'], candidates=[], lookup_allowed=True)
                            continue
                        if isinstance(evidence, dict):
                            candidates = evidence['values']
                            lookup_count += evidence['queries']-1
                        else: candidates = evidence
                        matched = [v for v in candidates if value_text(v) == needle]
                        if len(matched) == 1:
                            canonical, state, reason = matched[0], 'BOUND', 'authorized_lookup'
                        else:
                            state, reason = ('AMBIGUOUS', 'input_entity_ambiguous') if len(candidates) > 1 else ('PRESENT_UNRESOLVED', 'input_entity_unresolved')
                    except (AnalysisError, TimeoutError, ConnectionError) as error:
                        lookup_count += getattr(error,'lookup_queries',1)-1
                        forbidden=getattr(error,'category',None) in {'privacy','query_scope'}
                        state, reason = ('FORBIDDEN','input_scope_forbidden') if forbidden else ('UNAVAILABLE','input_lookup_unavailable')
            add('entity', a, b, state, reason, dimension=name, label=d['business_name'], candidates=[] if canonical is None else [canonical], lookup_allowed=mode=='lookup')

    # A bare unknown qualifier after a recognized metric is still not a
    # complete request. This check is intentionally local; arbitrary prose
    # elsewhere is left for the semantic engine rather than a word whitelist.
    if not head_mentions and len(anchors.get('metrics', [])) == 1:
        metric = anchors['metrics'][0]
        remainder = text[metric['end']:].strip()
        known_words = set(' '.join(value_text(a) for section in ('metrics','dimensions') for d in catalog.registry[section].values()
            for a in [d['business_name'], *d.get('aliases', [])]).split())
        known_words.update('nhé nhe ơi oi bạn ban b giúp giup với voi xem thế the nào nao sao bao nhieu tinh hinh hien tai nay thoi di a nhé nhất nhat cao thap tang giam tong hop cua trong ky nay truoc toi tat ca toan he thong du lieu theo thang nam quy tuan ngay va so sanh chua da khong duoc can co donut line area bar chart bang tron cot duong'.split())
        known_words.update(value_text(' '.join(catalog.registry.get('workspace',{}).get('generic_question_suffixes',[]))).split())
        known_words.update(value_text(' '.join(p['clause_boundaries']+p['numeric_relations']+catalog.registry['interpretation'].get('retrieval_stopwords',[])+list(catalog.registry['interpretation'].get('time_aliases',{})))).split())
        known_words.update(value_text(' '.join(p['clause_predicates'])).split())
        known_value = bool(anchors.get('values'))
        first=remainder.split()[0] if remainder else ''
        if remainder and not known_value and not first.isdecimal() and first not in known_words:
            start = metric['end'] + len(text[metric['end']:]) - len(text[metric['end']:].lstrip())
            end=min([b.start() for b in boundaries if b.start()>start]+[len(text)])
            add('residual', start, end, 'PRESENT_UNRESOLVED', 'input_residual_unresolved', label='Cụm bổ sung')

    from services.access_policy import active_principal
    principal = active_principal.get()
    access = principal.access_fingerprint if principal else 'internal'
    identity = hashlib.sha256(json.dumps([question, context, catalog.fingerprint, p, access], ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
    unresolved = [s for s in slots if s['state'] != 'BOUND']
    filters = list(numeric_filters)
    for name in {s.get('dimension') for s in slots if s['state']=='BOUND' and s.get('dimension')}:
        if (definitions[name].get('value_grounding') or {}).get('mode') != 'lookup': continue
        positive, negative = [], []
        for s in slots:
            if s.get('dimension') != name or s['state'] != 'BOUND': continue
            excluded = re.search(r'\b(?:tru|ngoai tru|khong gom|loai tru)\b[^;]*$', value_text(question[:s['start']]))
            (negative if excluded else positive).extend(s['candidates'])
        if positive:
            values=list(dict.fromkeys(positive))
            filters.append(dict(dimension=name,operator='eq' if len(values)==1 else 'in',value=values[0] if len(values)==1 else values))
        if negative:
            # The governed Filter contract has eq/in only for categorical
            # values. Do not invent NOT IN or a truncated lookup universe.
            for s in slots:
                if s.get('dimension') == name and any(v in negative for v in s.get('candidates', [])):
                    s.update(state='PRESENT_UNRESOLVED', reason='input_exclusion_unresolved')
                    if s not in unresolved: unresolved.append(s)
    findings = [dict(level='block', code=s['reason'], message=message(s), slot_id=s['id'], dimension=s.get('dimension'),
                     fixes=[dict(kind='advice', label='Sửa cụm được đánh dấu hoặc chọn giá trị từ danh mục được cấp quyền.')]) for s in unresolved]
    for s,f in zip(unresolved,findings):
        if s.get('dimension') and s['reason']=='input_entity_unresolved' and not s.get('lookup_allowed'):
            f['fixes'].extend(dict(kind='replace_span',label=f'Dùng {v}',start=s['start'],end=s['end'],old_text=s['raw'],new_text=str(v))
                for v in dimension_values(catalog,s['dimension'])[:4])
    clauses=[]
    for match in re.finditer(r'[^;\n]+',question):
        clause_id=f'c{len(clauses)+1}'
        owned=[s for s in slots if match.start()<=s['start']<match.end()]
        for s in owned:s['clause_id']=clause_id
        clauses.append(dict(id=clause_id,start=match.start(),end=match.end(),slot_ids=[s['id'] for s in owned],
            state='PRESENT_UNRESOLVED' if any(s['state']!='BOUND' for s in owned) else 'BOUND'))
    return dict(version=p['version'], policy_fingerprint=policy_fingerprint(),fingerprint=identity,
                catalog_fingerprint=catalog.fingerprint,access_fingerprint=access,clauses=clauses,
                slots=slots, findings=findings, can_submit=not unresolved, required_filters=filters,
                provider_calls=0, analytical_queries=0, lookup_queries=lookup_count)


def validate_structured_scope(scope, catalog, validation, lookup=None, grounded_filters=()):
    """Use execution grounding on selected values; the default lookup reads cache only."""
    if (scope or {}).get('mode') != 'selected':
        return
    from services.semantic_tools import SemanticTools
    from services.value_grounding_service import selected_scope_lookup_allowance
    lookup = lookup or entity_lookup(catalog)
    attempts = validation['lookup_queries']
    allowance = selected_scope_lookup_allowance(scope.get('filters') or [], policy()['max_lookup_slots'])
    current_dimension = None

    def bounded_lookup(table, column, reference, **kwargs):
        nonlocal attempts
        if attempts >= allowance:
            raise AnalysisError('input_lookup_required', 'Cần xác minh thêm giá trị phạm vi.')
        attempts += 1
        try:
            evidence = lookup(current_dimension, reference)
        except (AnalysisError, TimeoutError, ConnectionError) as error:
            validation['lookup_queries'] += getattr(error, 'lookup_queries', 0)
            raise
        if evidence is None:
            raise AnalysisError('input_lookup_required', 'Cần kiểm tra tên trong dữ liệu được cấp quyền.')
        validation['lookup_queries'] += evidence.get('queries', 0) if isinstance(evidence, dict) else 0
        return evidence['values'] if isinstance(evidence, dict) else evidence

    semantic = SemanticTools(catalog, bounded_lookup)
    # Internal pipeline context only: these exact members already passed the
    # server's SemanticTools lookup and access checks in ui_context.
    grounded = {}
    for constraint in grounded_filters or ():
        grounded.setdefault(constraint['dimension'], set()).update(
            value_text(v) for v in (constraint['value'] if isinstance(constraint['value'], list) else [constraint['value']]))
    for constraint in scope.get('filters') or []:
        current_dimension = constraint.get('dimension')
        definition = catalog.registry['dimensions'].get(current_dimension, {})
        if not definition.get('scope_selectable'):
            continue  # Structural validation owns unsupported dimensions.
        values = constraint['value'] if isinstance(constraint['value'], list) else [constraint['value']]
        for value in values:
            if value_text(value) in grounded.get(current_dimension, set()):
                continue
            if (definition.get('value_grounding') or {}).get('mode') == 'literal' and type(value) in (int, float, bool):
                continue
            reason = None
            try:
                answer = semantic.resolve({'dimension': current_dimension, 'reference': str(value)}, allow_fallback=True)
                if answer['status'] != 'resolved':
                    reason = 'input_entity_unresolved'
            except (AnalysisError, TimeoutError, ConnectionError) as error:
                category = getattr(error, 'category', None)
                reason = ('input_scope_forbidden' if category in {'privacy', 'query_scope'} else
                          'input_lookup_required' if category == 'input_lookup_required' else 'input_lookup_unavailable')
            if not reason:
                continue
            slot_id = 'scope_' + str(len(validation['slots']) + 1)
            validation['slots'].append(dict(id=slot_id, kind='structured_scope', dimension=current_dimension,
                label=definition['business_name'], raw=str(value), state='PRESENT_UNRESOLVED', reason=reason,
                lookup_allowed=reason == 'input_lookup_required', candidates=[], start=0, end=0))
            validation['findings'].append(dict(level='block', code=reason, dimension=current_dimension,
                slot_id=slot_id, message=f"Phạm vi {definition['business_name']}: “{value}” chưa được xác minh trong dữ liệu được cấp quyền.",
                fixes=[dict(kind='advice', label='Kiểm tra tên hoặc chọn lại phạm vi trong danh mục.')]))
            validation['can_submit'] = False


def message(slot):
    raw = slot['raw'][:100]
    if slot['reason'] == 'input_lookup_required':
        return f'Cần kiểm tra {slot["label"].lower()} “{raw}” trong dữ liệu được cấp quyền trước khi phân tích.'
    if slot['reason'] == 'input_value_missing':
        return f'Bạn đã nêu {slot["label"].lower()} nhưng chưa chọn giá trị. Hãy bổ sung hoặc sửa câu hỏi.'
    if slot['reason'] == 'input_exclusion_unresolved':
        return 'Chưa có tập giá trị đầy đủ để loại trừ tên này an toàn. Hãy chọn rõ các đối tượng cần giữ lại.'
    if slot['kind'] == 'residual': return f'Chưa xác minh được ý nghĩa của “{raw}”. Hãy nêu rõ địa bàn, đối tượng hoặc điều kiện cần phân tích.'
    if slot['kind'] == 'mutation': return 'Trợ lý phân tích chỉ đọc dữ liệu; không xóa, sửa hay ghi dữ liệu. Hãy đặt câu hỏi phân tích (ví dụ: số đơn bị hủy tháng 9/2026).'
    if slot['kind'] == 'control': return 'Câu hỏi có ký tự điều khiển hoặc ký tự ẩn. Hãy xóa ký tự đó hoặc nhập lại nội dung trước khi phân tích.'
    if slot['kind'] == 'time': return f'Thời gian “{raw}” chưa hợp lệ hoặc mâu thuẫn. Hãy sửa kỳ phân tích.'
    if slot['kind'] == 'ranking': return f'“{raw}” chưa hợp lệ. Top/Bottom N phải là số nguyên từ 1 đến {policy()["max_top_n"]}.'
    if slot['kind'] == 'number': return f'Điều kiện “{raw}” cần một giá trị số hợp lệ. Hãy sửa điều kiện trước khi phân tích.'
    if slot['reason']=='input_condition_unsupported':return 'Ngưỡng trên chỉ số đã tổng hợp chưa được hỗ trợ trong hợp đồng phân tích. Hãy nêu rõ cần lọc giá trị từng đơn hay so sánh tổng theo nhóm; hệ thống chưa chạy yêu cầu này.'
    if slot['state'] == 'UNAVAILABLE': return 'Chưa thể tra cứu tên trong dữ liệu được cấp quyền. Vui lòng thử lại; yêu cầu chưa được chạy.'
    if slot['state'] == 'FORBIDDEN': return 'Tên cần kiểm tra chưa nằm trong phạm vi tra cứu của tài khoản. Hãy chọn mã cửa hàng được cấp quyền.'
    return f'Chưa xác minh được {slot["label"].lower()} “{raw}”. Sửa tên hoặc chọn lại giá trị trước khi phân tích.'


def enforce(question, catalog, **kwargs):
    kwargs.setdefault('lookup', entity_lookup(catalog, resolve=True))
    result = validate(question, catalog, **kwargs)
    if not result['can_submit']:
        error = AnalysisError('clarification', result['findings'][0]['message'])
        error.input_validation = result
        raise error
    return result
