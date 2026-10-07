"""Bounded inference-only policy for guarded tools; no discovery or business retries."""
from email.utils import parsedate_to_datetime
import hashlib
import json
import logging
import os
import re
import threading
import time
from src.common.gemini_compat import compatibility_error, inference_messages, request_diagnostics

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
               required=False, metrics=None, compact_messages=None, turn_health=None, round_index=0):
    """Retry inference from known results, never restart/execute a tool turn."""
    from src.common import groq_service as wrappers
    from src.agents.agent_memory import safe_text
    metrics = metrics if metrics is not None else {}
    turn_health = turn_health if turn_health is not None else {}
    restricted = turn_health.setdefault('restricted_accounts', set())
    missing = turn_health.setdefault('missing_models', set())
    incompatible = turn_health.setdefault('incompatible_requests', set())
    compatibility_modes = turn_health.setdefault('compatibility_modes', {})
    compatibility_retried = False
    metrics.setdefault('compatibility_retry_count', 0)
    reported_tier = 'override' if explicit_model else tier if enabled() else 'fixed'
    metrics['model_tier'] = reported_tier
    used = metrics.setdefault('model_tiers_used', [])
    if reported_tier not in used:
        used.append(reported_tier)
    budget = number('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', 4, 1, 12)
    timeout = number('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', 30, 1, 30)
    deadline = time.monotonic() + number('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', 45, 1, 60)
    attempts, last_reason, compacted = 0, 'provider_unavailable', False
    previous_attempt = None
    providers = provider_order(preferred)
    pinned = turn_health.get('last_success') if turn_health.get('semantic_repair_pending') else None
    if pinned and pinned[0] in providers:
        providers = [pinned[0], *[p for p in providers if p != pinned[0]]]
    for provider_index, provider in enumerate(providers):
        if provider not in {'gemini', 'openai', 'groq', 'openrouter', 'cerebras'}:
            continue
        keys = credentials(provider)
        primary_count = (min(len(keys), number('AI_AGENT_GEMINI_PRIMARY_KEY_COUNT', 3, 1, 100))
                         if provider == 'gemini' else len(keys))
        with _lock:
            start = _next_slot.get(provider, 0) % max(1, primary_count)
        slots = list(range(start, primary_count)) + list(range(start)) + list(range(primary_count, len(keys)))
        if pinned and pinned[0] == provider and pinned[1] in slots:
            slots = [pinned[1], *[slot for slot in slots if slot != pinned[1]]]
        # Reserve one actual attempt for a configured emergency provider. The
        # old trailing account remains usable when primary accounts cool down.
        reserve = int(any(credentials(other) for other in providers[provider_index+1:]
                          if other in {'gemini', 'openai', 'groq', 'openrouter', 'cerebras'}))
        provider_budget = max(1, budget-reserve)
        # A reserved attempt also needs time; otherwise slow primary accounts
        # consume the entire round before the emergency provider can run.
        remaining = max(0, deadline-time.monotonic())
        provider_deadline = deadline - (min(timeout, remaining/3) if reserve and budget > 1 else 0)
        models = models_for(provider, tier, explicit_model, preferred)
        if pinned and pinned[0] == provider and pinned[2] in models:
            models = [pinned[2], *[model for model in models if model != pinned[2]]]
        for model_index, model in enumerate(models):
            # Keep one of the existing attempts for a later configured model.
            model_budget = max(1, provider_budget - int(model_index < len(models) - 1))
            if (provider, model) in missing:
                continue
            model_remaining = max(0, provider_deadline - time.monotonic())
            model_deadline = provider_deadline - (min(timeout, model_remaining / 3)
                if model_index < len(models) - 1 and provider_budget > 1 else 0)
            mode_key = (provider, model, bool(schemas))
            mode = compatibility_modes.get(mode_key, 'gemini_signature_preserved' if provider == 'gemini' else 'canonical')
            for slot in slots:
                if attempts >= model_budget or time.monotonic() >= model_deadline:
                    break
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
                while attempts < model_budget and time.monotonic() < model_deadline:
                    kwargs = {'model': model, 'messages': inference_messages(messages, provider), 'max_tokens': max_tokens,
                        'temperature': 0.1, 'response_format': {'type': 'json_object'},
                        'timeout': max(0.1, min(timeout, model_deadline-time.monotonic()))}
                    if schemas:
                        kwargs.update(tools=schemas, tool_choice='required' if required else 'auto')
                        if (provider == 'gemini' and required and len(schemas) == 1
                                and schemas[0].get('function', {}).get('name') == 'customer_actions'):
                            # Live qualification rejects ANY/named forcing for this
                            # nested contract. The server still requires one repaired
                            # action proposal; prose cannot satisfy protocol repair.
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
                        break
                    attempts += 1
                    metrics['provider_attempt_count'] = metrics.get('provider_attempt_count', 0) + 1
                    counts = metrics.setdefault('provider_attempts_by_provider', {})
                    counts[provider] = counts.get(provider, 0) + 1
                    for field, value in (('credential_slots_tried', f'{provider}:{slot+1}'), ('models_tried', safe_text(model, 128))):
                        values = metrics.setdefault(field, [])
                        if value not in values:
                            values.append(value)
                    identity = (provider, slot, model)
                    metrics['fallback_count'] = metrics.get('fallback_count', 0) + int(previous_attempt is not None and previous_attempt != identity)
                    previous_attempt = identity
                    diagnostic = {**shape, 'provider': provider, 'model': safe_text(model, 128),
                        'timeout_seconds': round(kwargs['timeout'], 3),
                        'round_index': round_index, 'request_sequence': metrics['provider_attempt_count']}
                    metrics.setdefault('provider_request_shapes', []).append(diagnostic)
                    metrics['provider_request_shape_fingerprint'] = request_shape
                    metrics['compatibility_mode'] = mode
                    logger.info('[AgentProviderRequest] %s', json.dumps(diagnostic))
                    started = time.perf_counter()
                    try:
                        response = client.chat.completions.create(**kwargs)
                        if not response.choices:
                            raise ValueError('empty_provider_response')
                        with _lock:
                            _next_slot[provider] = (slot+1) % max(1, primary_count)
                        turn_health['last_success'] = (provider, slot, model)
                        return response, client, model, None
                    except Exception as exc:
                        kind, status, delay = classify(exc)
                        last_reason = kind
                        metrics['provider_failure_count'] = metrics.get('provider_failure_count', 0) + 1
                        elapsed = round((time.perf_counter()-started)*1000, 2)
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
                        if kind == 'incompatible_request':
                            incompatible.add((provider, model, request_shape))
                            # Evidence-triggered inference-only downgrade. No schema,
                            # tool choice, history/result, key or business replay change.
                            if (provider == 'gemini' and (category in {'response_format_incompatible', 'unknown_incompatible_request'} or status == 400)
                                    and kwargs.get('response_format') and not compatibility_retried
                                    and attempts < provider_budget and time.monotonic() < model_deadline):
                                compatibility_retried = True
                                mode = 'gemini_without_response_format'
                                compatibility_modes[mode_key] = mode
                                metrics['compatibility_retry_count'] += 1
                                continue  # Same client/key/model; shares attempt/time budget.
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
                            break  # Same request/model cannot improve with another key.
                        with _lock:
                            # Failed transient/account attempts must advance the
                            # next turn too, rather than repeatedly starting at key 1.
                            _next_slot[provider] = (slot+1) % max(1, primary_count)
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
            if attempts >= provider_budget or time.monotonic() >= provider_deadline:
                break
    return None, None, None, last_reason
