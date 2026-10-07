"""Bounded inference-only policy for guarded tools; no discovery or business retries."""
from email.utils import parsedate_to_datetime
import hashlib
import json
import logging
import math
import os
import re
import threading
import time
from src.common.gemini_compat import compatibility_error, inference_messages, request_diagnostics

logger = logging.getLogger(__name__)
_lock = threading.Lock()
_cooldowns = {}  # (provider, credential SHA-256, model) -> monotonic deadline
_transient_cooldowns = {}  # (provider, model) -> (monotonic deadline, fixed reason); shared across keys
_invalid_credentials = set()
_next_slot = {}


def number(name, default, minimum, maximum):
    try:
        return max(minimum, min(maximum, int(os.getenv(name, default))))
    except (ValueError, TypeError):
        return default


def enabled():
    return os.getenv('AI_AGENT_ENABLE_MODEL_TIERING', '1').lower() in {'1', 'true', 'yes'}


def csv(value):
    return list(dict.fromkeys(part.strip() for part in value.split(',') if part.strip()))


def select_tier(context, round_index=0, repair_count=0, after_mutation=False):
    """Execution signals only; this function never receives customer prose."""
    state = context.get('business') or {}
    checkout = state.get('checkout') or {}
    if repair_count >= 2:
        return 'strong'
    if (repair_count or round_index >= 2 or after_mutation
            or checkout.get('flow_stage') == 'SUMMARY'
            or (state.get('pending') or {}).get('type') == 'confirm_checkout'):
        return 'standard'
    return 'lite'


def models_for(provider, tier, explicit_model=None, preferred='auto'):
    # Explicit model is scoped to its chosen provider, never silently substituted.
    requested = explicit_model if explicit_model and (provider == preferred or preferred in {'', 'auto'}) else None
    defaults = {'gemini': 'gemini-3.5-flash-lite', 'openai': 'gpt-4o-mini',
        'groq': 'llama-3.3-70b-versatile', 'cerebras': 'llama3.1-8b',
        'openrouter': 'openai/gpt-4o-mini'}
    default = os.getenv('AI_AGENT_'+provider.upper()+'_MODEL', defaults.get(provider, ''))
    if requested:
        pool = [requested]
    elif provider == 'gemini' and enabled():
        # Ordered text/tool models; the same pool can serve every tier.
        pool = csv(os.getenv('AI_AGENT_GEMINI_'+tier.upper()+'_MODELS', ''))
        standard = csv(os.getenv('AI_AGENT_GEMINI_STANDARD_MODELS', '')) or list(dict.fromkeys([default, 'gemini-3.1-flash-lite']))
        if not pool and tier != 'standard':
            pool = standard
        pool = pool or [default]
        if tier != 'standard':
            pool = list(dict.fromkeys(pool+standard))
    else:
        pool = [default]
    # Reject specialised non-text families even when accidentally configured.
    excluded = ('image', 'banana', 'tts', 'audio', 'live', 'transcrib', 'embed',
                'robot', 'veo', 'lyria', 'gemma', 'whisper')
    return [model for model in pool if model and not any(part in model.lower() for part in excluded)]


def provider_order(preferred):
    preferred = preferred if preferred not in {'', 'auto'} else 'gemini'
    return csv(preferred+','+os.getenv('AI_AGENT_FALLBACK_PROVIDERS', ''))


def credentials(provider):
    return [key for key in csv(os.getenv(provider.upper()+'_API_KEY', ''))
            if len(key) >= 8 and not key.lower().startswith(('your_', 'placeholder'))]


def classify(exc):
    response = getattr(exc, 'response', None)
    status = getattr(exc, 'status_code', None) or getattr(response, 'status_code', None)
    text = str(getattr(exc, 'error_text', str(exc))).lower()  # Never emit this text.
    network_error = (isinstance(exc, (TimeoutError, ConnectionError))
        or any(part in type(exc).__name__.lower() for part in ('timeout', 'connection')))
    if not status and network_error:
        return 'network_timeout', None, 0
    if not status:
        match = re.search(r'\b(400|401|402|403|404|413|429|5\d\d)\b', text)
        status = int(match[1]) if match else None
    if status == 401:
        kind = 'invalid_credential'
    elif status == 403:
        kind = 'account_restricted'
    elif status and status >= 500:
        kind = 'provider_transient'
    elif status == 429:
        kind = 'rate_limit'
    elif status == 404 or 'model_not_found' in text or 'decommissioned' in text:
        kind = 'model_not_found'
    elif ('tokens per minute' in text or 'tpm' in text or status in {402, 429}
            or 'rate_limit' in text or 'resource_exhausted' in text or 'quota' in text):
        kind = 'rate_limit'
    elif any(term in text for term in ('context_length', 'context window', 'context length',
                                     'maximum context', 'too many tokens', 'input token count')) or status == 413:
        kind = 'context_length'
    elif status == 400:
        kind = 'incompatible_request'
    else:
        kind = 'provider_error'
    headers = getattr(exc, 'headers', None) or getattr(response, 'headers', None) or {}
    retry_after = headers.get('Retry-After') or headers.get('retry-after')
    delay = 60
    if retry_after:
        try:
            delay = float(retry_after)
        except (ValueError, TypeError):
            try:
                delay = parsedate_to_datetime(retry_after).timestamp() - time.time()
            except (ValueError, TypeError, OverflowError):
                pass
    return kind, status, max(1, min(300, delay))


PROVIDERS = frozenset({'gemini', 'openai', 'groq', 'openrouter', 'cerebras'})


def wait_limits():
    # Hard chat ceilings also bound old 30/45 configuration without editing secrets.
    return (number('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', 15, 1, 18),
            number('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', 28, 1, 30))


def _routes(preferred, explicit_model, tier, pinned):
    """Ordered candidates, no discovery request and no outbound work."""
    providers = [p for p in provider_order(preferred) if p in PROVIDERS]
    if pinned and pinned[0] in providers:
        providers = [pinned[0], *[p for p in providers if p != pinned[0]]]
    routes = []
    for provider in providers:
        keys = credentials(provider)
        primary_count = (min(len(keys), number('AI_AGENT_GEMINI_PRIMARY_KEY_COUNT', 3, 1, 100))
                         if provider == 'gemini' else len(keys))
        with _lock:
            start = _next_slot.get(provider, 0) % max(1, primary_count)
        slots = list(range(start, primary_count)) + list(range(start)) + list(range(primary_count, len(keys)))
        models = models_for(provider, tier, explicit_model, preferred)
        if pinned and pinned[0] == provider:
            if pinned[1] in slots:
                slots = [pinned[1], *[slot for slot in slots if slot != pinned[1]]]
            if pinned[2] in models:
                models = [pinned[2], *[model for model in models if model != pinned[2]]]
        for model in models:
            for slot in slots:
                routes.append({'provider': provider, 'slot': slot, 'model': model,
                    'key': keys[slot], 'fingerprint': hashlib.sha256(keys[slot].encode()).hexdigest(),
                    'primary_count': primary_count})
    return routes


def _unavailable(route, restricted, missing, blocked):
    provider, model = route['provider'], route['model']
    group = (provider, model)
    health_key = (provider, route['fingerprint'], model)
    if group in missing or group in blocked:
        return 'model_not_found' if group in missing else 'route_exhausted', False
    with _lock:
        now = time.monotonic()
        for key in [k for k, until in _cooldowns.items() if until <= now]:
            del _cooldowns[key]
        for key in [k for k, (until, _) in _transient_cooldowns.items() if until <= now]:
            del _transient_cooldowns[key]
        if group in _transient_cooldowns:
            return _transient_cooldowns[group][1], True
        if (provider, route['fingerprint']) in _invalid_credentials:
            return 'invalid_credential', False
        if health_key in restricted:
            return 'account_restricted', False
        if _cooldowns.get(health_key, 0) > now:
            return 'rate_limit', True
    return None, False


def completion(messages, schemas, *, preferred, explicit_model, tier, max_tokens,
               required=False, metrics=None, compact_messages=None, turn_health=None, round_index=0):
    """One sequential inference scheduler. It never starts/replays business work."""
    from src.common import groq_service as wrappers
    from src.agents.agent_memory import safe_text
    metrics = metrics if metrics is not None else {}
    turn_health = turn_health if turn_health is not None else {}
    restricted = turn_health.setdefault('restricted_accounts', set())
    missing = turn_health.setdefault('missing_models', set())
    incompatible = turn_health.setdefault('incompatible_requests', set())
    compatibility_modes = turn_health.setdefault('compatibility_modes', {})
    compatibility_retried = False
    for field in ('compatibility_retry_count', 'provider_attempt_count', 'provider_failure_count',
                  'provider_wait_ms', 'provider_routes_considered', 'provider_routes_skipped_cooldown',
                  'network_timeout_count', 'provider_transient_count'):
        metrics.setdefault(field, 0)
    reported_tier = 'override' if explicit_model else tier if enabled() else 'fixed'
    metrics['model_tier'] = reported_tier
    used = metrics.setdefault('model_tiers_used', [])
    if reported_tier not in used:
        used.append(reported_tier)
    budget = number('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', 4, 1, 12)
    timeout, round_wait = wait_limits()
    deadline = time.monotonic() + round_wait
    metrics['round_wait_budget_ms'] = round_wait * 1000
    attempts, last_reason, compacted = 0, 'provider_unavailable', False
    previous_attempt, blocked, failover_used = None, set(), False
    pinned = turn_health.get('last_success') if turn_health.get('semantic_repair_pending') else None
    routes = _routes(preferred, explicit_model, tier, pinned)
    pending = list(routes)
    while pending and attempts < budget and time.monotonic() < deadline:
        if previous_attempt and attempts == budget - 1:
            # Credential-specific failures cannot consume the last send reserved
            # for an actually eligible emergency provider.
            emergencies = [r for r in pending if r['provider'] != previous_attempt[0]
                and _unavailable(r, restricted, missing, blocked)[0] is None]
            if emergencies:
                pending.remove(emergencies[0])
                pending.insert(0, emergencies[0])
        route = pending.pop(0)
        metrics['provider_routes_considered'] += 1
        unavailable, cooldown = _unavailable(route, restricted, missing, blocked)
        if unavailable:
            metrics['provider_routes_skipped_cooldown'] += int(cooldown)
            if unavailable != 'route_exhausted':
                last_reason = unavailable
                metrics['provider_error_category'] = unavailable
            continue  # A skipped candidate is never an outbound attempt.
        provider, slot, model = route['provider'], route['slot'], route['model']
        group = (provider, model)
        health_key = (provider, route['fingerprint'], model)
        remaining = max(0, deadline - time.monotonic())
        # Reserve for ONE next distinct eligible group, not every key/model.
        # This keeps 10-11s healthy replies viable even with many configured routes.
        alternate = attempts + 1 < budget and any(
            (other['provider'], other['model']) != group
            and _unavailable(other, restricted, missing, blocked)[0] is None for other in pending)
        # After a long first stall, splitting again would starve the emergency
        # with 7s. Only reserve another pair if BOTH can still be useful; the
        # initial pair always shares fairly, including explicit short budgets.
        reserve = alternate and (attempts == 0 or remaining >= 2 * min(11, timeout))
        assigned = min(timeout, remaining / 2 if reserve else remaining)
        route_deadline = time.monotonic() + assigned
        mode_key = (provider, model, bool(schemas))
        mode = compatibility_modes.get(mode_key, 'gemini_signature_preserved' if provider == 'gemini' else 'canonical')
        if provider == 'gemini':
            client = wrappers.GeminiClient(route['key'])
        elif provider == 'openai':
            client = wrappers.OpenAIClient(route['key'])
        elif provider == 'openrouter':
            client = wrappers.OpenRouterClient(route['key'])
        elif provider == 'groq':
            from groq import Groq
            client = Groq(api_key=route['key'], max_retries=0)
        else:
            client = wrappers.OpenAIClient(route['key'], base_url='https://api.cerebras.ai/v1')
        while attempts < budget and time.monotonic() < min(route_deadline, deadline):
            kwargs = {'model': model, 'messages': inference_messages(messages, provider), 'max_tokens': max_tokens,
                'temperature': 0.1, 'response_format': {'type': 'json_object'},
                'timeout': min(timeout, route_deadline - time.monotonic(), deadline - time.monotonic())}
            if schemas:
                kwargs.update(tools=schemas, tool_choice='required' if required else 'auto')
                if (provider == 'gemini' and required and len(schemas) == 1
                        and schemas[0].get('function', {}).get('name') == 'customer_actions'):
                    kwargs['tool_choice'] = 'auto'
                    mode = 'gemini_semantic_repair_auto'
            if provider == 'gemini' and (mode == 'gemini_without_response_format' or schemas):
                kwargs.pop('response_format', None)
            if provider == 'openrouter':
                kwargs['allow_fallback'] = False  # No hidden unbudgeted requests.
            shape = request_diagnostics(kwargs, mode)
            request_shape = shape['request_shape_fingerprint']
            if (provider, model, request_shape) in incompatible:
                last_reason = 'incompatible_request'
                blocked.add(group)
                break
            attempts += 1
            metrics['provider_attempt_count'] += 1
            counts = metrics.setdefault('provider_attempts_by_provider', {})
            counts[provider] = counts.get(provider, 0) + 1
            for field, value in (('credential_slots_tried', f'{provider}:{slot+1}'), ('models_tried', safe_text(model, 128))):
                values = metrics.setdefault(field, [])
                if value not in values:
                    values.append(value)
            identity = (provider, slot, model)
            switched = previous_attempt is not None and previous_attempt != identity
            failover_used |= switched
            metrics['fallback_count'] = metrics.get('fallback_count', 0) + int(switched)
            previous_attempt = identity
            selected = {'provider': provider, 'credential_slot': slot+1, 'model': safe_text(model, 128),
                        'compatibility_mode': mode}
            metrics['provider_route_selected'] = selected
            diagnostic = {**shape, **selected, 'timeout_seconds': round(kwargs['timeout'], 3),
                'round_deadline_remaining_ms': round(max(0, deadline-time.monotonic())*1000, 2),
                'round_index': round_index, 'request_sequence': metrics['provider_attempt_count']}
            metrics['attempt_timeout_assigned_ms'] = round(kwargs['timeout']*1000, 2)
            metrics.setdefault('provider_request_shapes', []).append(diagnostic)
            metrics['provider_request_shape_fingerprint'] = request_shape
            metrics['compatibility_mode'] = mode
            logger.info('[AgentProviderRequest] %s', json.dumps(diagnostic))
            started = time.monotonic()
            try:
                response = client.chat.completions.create(**kwargs)
                if time.monotonic() > min(route_deadline, deadline):
                    raise TimeoutError('inference deadline exceeded')
                if not response.choices:
                    raise ValueError('empty_provider_response')
                with _lock:
                    _next_slot[provider] = (slot+1) % max(1, route['primary_count'])
                    _transient_cooldowns.pop(group, None)
                turn_health['last_success'] = (provider, slot, model)
                if failover_used:
                    metrics['failover_success'] = True
                    metrics['failover_provider'] = provider
                return response, client, model, None
            except Exception as exc:
                kind, status, delay = classify(exc)
                last_reason = kind
                metrics['provider_failure_count'] += 1
                elapsed = round((time.monotonic()-started)*1000, 2)
                metrics['provider_failure_latency_ms'] = metrics.get('provider_failure_latency_ms', 0) + elapsed
                metrics['failed_provider_latency_ms'] = metrics['provider_failure_latency_ms']
                metrics['retry_reason'] = kind
                category, field = compatibility_error(exc) if kind == 'incompatible_request' else (kind, None)
                metrics['provider_error_category'] = category
                metrics['provider_error_field'] = field
                metrics['provider_error_type'] = type(exc).__name__
                logger.warning('[AgentProvider] provider=%s credential_slot=%d model=%s status=%s reason=%s category=%s field=%s timeout_seconds=%.3f error_type=%s request_shape=%s',
                               provider, slot+1, safe_text(model, 128), status, kind, category, field,
                               kwargs['timeout'], type(exc).__name__, request_shape)
                emergency_reserved = attempts == budget - 1 and any(
                    other['provider'] != provider
                    and _unavailable(other, restricted, missing, blocked)[0] is None for other in pending)
                if kind == 'incompatible_request':
                    incompatible.add((provider, model, request_shape))
                    if (provider == 'gemini' and (category in {'response_format_incompatible', 'unknown_incompatible_request'} or status == 400)
                            and kwargs.get('response_format') and not compatibility_retried
                            and not emergency_reserved
                            and attempts < budget and time.monotonic() < min(route_deadline, deadline)):
                        compatibility_retried = True
                        mode = 'gemini_without_response_format'
                        compatibility_modes[mode_key] = mode
                        metrics['compatibility_retry_count'] += 1
                        continue  # Same route/allocated deadline/attempt budget.
                if kind == 'context_length':
                    if not compacted and compact_messages:
                        smaller = compact_messages(messages)
                        if smaller and smaller != messages:
                            messages, compacted = smaller, True
                            metrics['context_compaction_count'] = metrics.get('context_compaction_count', 0) + 1
                            if emergency_reserved:
                                break  # Compacted inference state goes to the reserved provider.
                            continue
                    return None, client, model, kind
                if kind in {'model_not_found', 'incompatible_request', 'provider_error'}:
                    blocked.add(group)
                    if kind == 'model_not_found':
                        missing.add(group)
                with _lock:
                    if kind == 'invalid_credential':
                        _invalid_credentials.add((provider, route['fingerprint']))
                    elif kind == 'rate_limit':
                        _cooldowns[health_key] = time.monotonic()+delay
                    elif kind == 'account_restricted':
                        restricted.add(health_key)
                    elif kind in {'network_timeout', 'provider_transient'}:
                        cool = number('AI_AGENT_PROVIDER_TRANSIENT_COOLDOWN_SECONDS', 30, 5, 60)
                        _transient_cooldowns[group] = (time.monotonic()+cool, kind)
                if kind in {'network_timeout', 'provider_transient'}:
                    metrics[kind+'_count'] += 1
                    # Prefer a different provider when explicitly allowed; otherwise
                    # another model. Key hopping cannot repair a route-wide stall.
                    pending.sort(key=lambda other: other['provider'] == provider)
                break
            finally:
                metrics['provider_wait_ms'] += round((time.monotonic()-started)*1000, 2)
                metrics['round_deadline_remaining_ms'] = round(max(0, deadline-time.monotonic())*1000, 2)
    # Advertise when an eligible configured route can next be retried. Model
    # cooldowns overlap: waiting for the earliest is enough, not their sum.
    availability = [(route, *_unavailable(route, restricted, missing, blocked)) for route in routes]
    cooling = [route for route, _, cooldown in availability if cooldown
               and (route['provider'], route['fingerprint']) not in _invalid_credentials
               and (route['provider'], route['fingerprint'], route['model']) not in restricted]
    if cooling and not any(reason is None for _, reason, _ in availability):
        with _lock:
            now = time.monotonic()
            delays = [max(0, _cooldowns.get((r['provider'], r['fingerprint'], r['model']), 0) - now,
                _transient_cooldowns.get((r['provider'], r['model']), (0, None))[0] - now) for r in cooling]
        metrics['retry_after_seconds'] = max(1, math.ceil(min(delays)))
    else:
        metrics.pop('retry_after_seconds', None)
    metrics['provider_outage_phase'] = 'cooldown' if cooling and attempts == 0 else 'inference_failed'
    logger.info('[AgentProviderUnavailable] phase=%s attempts=%d retry_after_seconds=%s reason=%s',
                metrics['provider_outage_phase'], attempts, metrics.get('retry_after_seconds'), last_reason)
    return None, None, None, last_reason
