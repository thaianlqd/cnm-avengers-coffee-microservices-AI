"""Inference-only Gemini metadata and content-free request diagnostics."""
from copy import deepcopy
import hashlib
import json
import re


def tool_extra_content(value):
    """Keep only Google's opaque signature, exactly as received; never invent one."""
    google = value.get('google') if isinstance(value, dict) else None
    signature = google.get('thought_signature') if isinstance(google, dict) else None
    return {'google': {'thought_signature': signature}} if isinstance(signature, str) and signature else {}


def inference_messages(messages, provider):
    """Copy inference history; Gemini-only metadata never reaches other providers."""
    rows = deepcopy(messages)
    for row in rows:
        for call in row.get('tool_calls') or []:
            extra = tool_extra_content(call.pop('extra_content', None))
            if provider == 'gemini' and extra:
                call['extra_content'] = extra
    return rows


def request_diagnostics(kwargs, compatibility_mode='canonical'):
    """No prompt/result/argument/ID/signature values enter this structure or hash."""
    messages, tools = kwargs.get('messages') or [], kwargs.get('tools') or []
    roles = {'system', 'user', 'assistant', 'tool'}
    calls = [call for row in messages for call in row.get('tool_calls') or []]
    results = [row for row in messages if row.get('role') == 'tool']
    def content_kind(row):
        value = row.get('content')
        return 'null' if value is None else 'empty_string' if value == '' else 'string' if isinstance(value, str) else 'other'
    def digest(value):
        return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    shape = {
        'compatibility_mode': compatibility_mode,
        'message_count': len(messages),
        'message_roles': [row.get('role') if row.get('role') in roles else 'other' for row in messages],
        'message_content_types': [content_kind(row) for row in messages],
        'has_tools': bool(tools), 'tool_count': len(tools),
        'tool_set_fingerprint': digest(sorted(str(row.get('function', {}).get('name')) for row in tools)),
        'schema_chars': len(json.dumps(tools, ensure_ascii=False)),
        'schema_fingerprint': digest(tools),
        'has_response_format': bool(kwargs.get('response_format')),
        'response_format_type': 'json_object' if kwargs.get('response_format') == {'type': 'json_object'} else 'other' if kwargs.get('response_format') else 'none',
        'tool_choice': (kwargs.get('tool_choice') if isinstance(kwargs.get('tool_choice'), str)
            and kwargs['tool_choice'] in {'auto', 'required', 'none'} else
            'named_function' if isinstance(kwargs.get('tool_choice'), dict) else 'other' if kwargs.get('tool_choice') else 'none'),
        'has_assistant_tool_calls': bool(calls), 'assistant_tool_call_count': len(calls),
        'tool_calls_per_message': [len(row.get('tool_calls') or []) for row in messages],
        'history_tool_set_fingerprint': digest(sorted(str(call.get('function', {}).get('name')) for call in calls)),
        'tool_arguments_are_strings': all(isinstance(call.get('function', {}).get('arguments'), str) for call in calls),
        'thought_signature_count': sum(bool(tool_extra_content(call.get('extra_content'))) for call in calls),
        'has_tool_result_messages': bool(results), 'tool_result_count': len(results),
        'tool_results_have_names': [bool(row.get('name')) for row in results],
        'tool_result_ids_match': ([row.get('tool_call_id') for row in results] == [call.get('id') for call in calls]),
    }
    shape['request_shape_fingerprint'] = digest(shape)
    return shape


def compatibility_error(exc):
    """Return fixed labels only. Provider-controlled text/paths are never emitted."""
    raw = str(getattr(exc, 'error_text', getattr(exc, 'message', str(exc))))[:65536]
    try:
        body = json.loads(raw)
        errors = body if isinstance(body, list) else [body]
        text = ' '.join(str(error.get('error', error).get('message', ''))
                        for error in errors if isinstance(error, dict)
                        and isinstance(error.get('error', error), dict)).lower()
    except (ValueError, TypeError):
        text = raw.lower()
    if re.search(r'thought[_ ]signature', text):
        return 'tool_continuation_incompatible', 'tool_calls'
    complaint = re.search(r'unsupported|not supported|incompatible|not allowed|cannot|invalid|reject', text)
    if complaint and (re.search(r'\bresponse[_ ]format\b|response[_ ]?mime[_ ]?type|responsemimetype|response mime type', text)
                      or ('application/json' in text and re.search(r'function calling|tool use|tools', text))):
        return 'response_format_incompatible', 'response_format'
    if complaint and re.search(r'\btool[_ ]choice\b', text):
        return 'tool_choice_incompatible', 'tool_choice'
    if re.search(r'tool_call_id|tool message|role.{0,12}tool', text):
        return 'tool_message_incompatible', 'tool_call_id'
    if re.search(r'parameters|additionalproperties|maxitems|function.?declarations|tool.?schema', text):
        return 'tool_schema_incompatible', 'parameters'
    if re.search(r'tool_calls|function.?call|continuation', text):
        return 'tool_continuation_incompatible', 'tool_calls'
    return 'unknown_incompatible_request', None
