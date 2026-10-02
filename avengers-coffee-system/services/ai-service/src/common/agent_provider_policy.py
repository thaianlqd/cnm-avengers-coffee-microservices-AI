"""Bounded inference-only policy for guarded tools; no discovery or business retries."""
from email.utils import parsedate_to_datetime
import hashlib
import json
import logging
import os
import re
import threading
import time

logger = logging.getLogger(__name__)
_lock = threading.Lock()
_cooldowns = {}  # (provider, credential SHA-256, model) -> monotonic deadline
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
    defaults = {'gemini': 'gemini-3.6-flash', 'openai': 'gpt-4o-mini',
        'groq': 'llama-3.3-70b-versatile', 'cerebras': 'llama3.1-8b',
        'openrouter': 'openai/gpt-4o-mini'}
    default = os.getenv('AI_AGENT_'+provider.upper()+'_MODEL', defaults.get(provider, ''))
    if requested:
        pool = [requested]
    elif provider == 'gemini' and enabled():
        # Empty Lite/Strong pools intentionally use the known LAN21 candidate.
        # UI display labels are not evidence of compatible API model IDs.
        pool = csv(os.getenv('AI_AGENT_GEMINI_'+tier.upper()+'_MODELS', ''))
        standard = csv(os.getenv('AI_AGENT_GEMINI_STANDARD_MODELS', '')) or [default]
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
    return csv(preferred+','+os.getenv('AI_AGENT_FALLBACK_PROVIDERS', 'gemini,openai'))


def credentials(provider):
    return [key for key in csv(os.getenv(provider.upper()+'_API_KEY', ''))
            if len(key) >= 8 and not key.lower().startswith(('your_', 'placeholder'))]


def classify(exc):
    response = getattr(exc, 'response', None)
    status = getattr(exc, 'status_code', None) or getattr(response, 'status_code', None)
    text = str(getattr(exc, 'error_text', str(exc))).lower()  # Never emit this text.
    if not status:
        match = re.search(r'\b(400|401|402|403|404|413|429|5\d\d)\b', text)
        status = int(match[1]) if match else None
    if status == 401:
        kind = 'invalid_credential'
    elif status == 403:
        kind = 'account_restricted'
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
    elif status and status >= 500:
        kind = 'provider_transient'
    elif isinstance(exc, (TimeoutError, ConnectionError)) or any(part in type(exc).__name__.lower() for part in ('timeout', 'connection')):
        kind = 'network_timeout'
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


def completion(messages, schemas, *, preferred, explicit_model, tier, max_tokens,
               required=False, metrics=None, compact_messages=None, turn_health=None):
    """Retry inference from known results, never restart/execute a tool turn."""
    from src.common import groq_service as wrappers
    from src.agents.agent_memory import safe_text
    metrics = metrics if metrics is not None else {}
    turn_health = turn_health if turn_health is not None else {}
    restricted = turn_health.setdefault('restricted_accounts', set())
    missing = turn_health.setdefault('missing_models', set())
    incompatible = turn_health.setdefault('incompatible_requests', set())
    request_shape = hashlib.sha256(json.dumps({'tools': schemas or [], 'required': bool(required),
        'response_format': 'json_object'}, sort_keys=True).encode()).hexdigest()
    reported_tier = 'override' if explicit_model else tier if enabled() else 'fixed'
    metrics['model_tier'] = reported_tier
    used = metrics.setdefault('model_tiers_used', [])
    if reported_tier not in used:
        used.append(reported_tier)
    budget = number('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', 4, 1, 12)
    timeout = number('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', 8, 1, 30)
    deadline = time.monotonic() + number('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', 12, 1, 60)
    attempts, last_reason, compacted = 0, 'provider_unavailable', False
    providers = provider_order(preferred)
    for provider_index, provider in enumerate(providers):
        if provider not in {'gemini', 'openai', 'groq', 'openrouter', 'cerebras'}:
            continue
        keys = credentials(provider)
        primary_count = (min(len(keys), number('AI_AGENT_GEMINI_PRIMARY_KEY_COUNT', 3, 1, 100))
                         if provider == 'gemini' else len(keys))
        with _lock:
            start = _next_slot.get(provider, 0) % max(1, primary_count)
        slots = list(range(start, primary_count)) + list(range(start)) + list(range(primary_count, len(keys)))
        # Reserve one actual attempt for a configured emergency provider. The
        # old trailing account remains usable when primary accounts cool down.
        reserve = int(any(credentials(other) for other in providers[provider_index+1:]
                          if other in {'gemini', 'openai', 'groq', 'openrouter', 'cerebras'}))
        provider_budget = max(1, budget-reserve)
        for model in models_for(provider, tier, explicit_model, preferred):
            if (provider, model) in missing or (provider, model, request_shape) in incompatible:
                continue
            for slot in slots:
                fingerprint = hashlib.sha256(keys[slot].encode()).hexdigest()
                health_key = (provider, fingerprint, model)
                with _lock:
                    now = time.monotonic()
                    for expired in [key for key, until in _cooldowns.items() if until <= now]:
                        del _cooldowns[expired]
                    unavailable = ((provider, fingerprint) in _invalid_credentials
                                   or health_key in restricted
                                   or _cooldowns.get(health_key, 0) > now)
                if unavailable:
                    continue
                if provider == 'gemini':
                    client = wrappers.GeminiClient(keys[slot])
                elif provider == 'openai':
                    client = wrappers.OpenAIClient(keys[slot])
                elif provider == 'openrouter':
                    client = wrappers.OpenRouterClient(keys[slot])
                elif provider == 'groq':
                    from groq import Groq
                    client = Groq(api_key=keys[slot], max_retries=0)
                else:
                    client = wrappers.OpenAIClient(keys[slot], base_url='https://api.cerebras.ai/v1')
                while attempts < provider_budget and time.monotonic() < deadline:
                    attempts += 1
                    metrics['provider_attempt_count'] = metrics.get('provider_attempt_count', 0) + 1
                    counts = metrics.setdefault('provider_attempts_by_provider', {})
                    counts[provider] = counts.get(provider, 0) + 1
                    for field, value in (('credential_slots_tried', f'{provider}:{slot+1}'), ('models_tried', safe_text(model, 128))):
                        values = metrics.setdefault(field, [])
                        if value not in values:
                            values.append(value)
                    metrics['fallback_count'] = metrics.get('fallback_count', 0) + int(attempts > 1)
                    kwargs = {'model': model, 'messages': messages, 'max_tokens': max_tokens,
                        'temperature': 0.35, 'response_format': {'type': 'json_object'},
                        'timeout': max(0.1, min(timeout, deadline-time.monotonic()))}
                    if schemas:
                        kwargs.update(tools=schemas, tool_choice='required' if required else 'auto')
                    if provider == 'openrouter':
                        kwargs['allow_fallback'] = False  # No hidden unbudgeted requests.
                    started = time.perf_counter()
                    try:
                        response = client.chat.completions.create(**kwargs)
                        if not response.choices:
                            raise ValueError('empty_provider_response')
                        with _lock:
                            _next_slot[provider] = (slot+1) % max(1, primary_count)
                        return response, client, model, None
                    except Exception as exc:
                        kind, status, delay = classify(exc)
                        last_reason = kind
                        metrics['provider_failure_count'] = metrics.get('provider_failure_count', 0) + 1
                        elapsed = round((time.perf_counter()-started)*1000, 2)
                        metrics['provider_failure_latency_ms'] = metrics.get('provider_failure_latency_ms', 0) + elapsed
                        metrics['failed_provider_latency_ms'] = metrics['provider_failure_latency_ms']
                        metrics['retry_reason'] = kind
                        logger.warning('[AgentProvider] provider=%s credential_slot=%d model=%s status=%s reason=%s',
                                       provider, slot+1, safe_text(model, 128), status, kind)
                        if kind == 'context_length':
                            if not compacted and compact_messages:
                                smaller = compact_messages(messages)
                                if smaller and smaller != messages:
                                    messages, compacted = smaller, True
                                    metrics['context_compaction_count'] = metrics.get('context_compaction_count', 0) + 1
                                    continue  # Same key/model, once, within attempt budget.
                            return None, client, model, kind
                        if kind in {'model_not_found', 'incompatible_request', 'provider_error'}:
                            if kind == 'model_not_found':
                                missing.add((provider, model))
                            elif kind == 'incompatible_request':
                                incompatible.add((provider, model, request_shape))
                            break  # Same request/model cannot improve with another key.
                        with _lock:
                            if kind == 'invalid_credential':
                                _invalid_credentials.add((provider, fingerprint))
                            elif kind == 'rate_limit':
                                _cooldowns[health_key] = time.monotonic()+delay
                            elif kind == 'account_restricted':
                                restricted.add(health_key)
                        break
                if last_reason in {'model_not_found', 'incompatible_request', 'provider_error'}:
                    break  # Next configured model, not the next account.
                if attempts >= budget or time.monotonic() >= deadline:
                    return None, None, model, last_reason
                if attempts >= provider_budget:
                    break
            if attempts >= provider_budget:
                break
    return None, None, None, last_reason
