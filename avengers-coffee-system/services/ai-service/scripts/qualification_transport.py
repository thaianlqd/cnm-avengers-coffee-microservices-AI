"""One run-wide external-request fence, counting repair and failover sends."""
import time


class QualificationStopped(RuntimeError):
    pass


class QualificationTransport:
    def __init__(self, sender, budget=24, spacing=4, sleeper=time.sleep):
        self.sender, self.budget, self.spacing, self.sleeper = sender, min(24, budget), spacing, sleeper
        self.attempts, self.consecutive_errors, self.stopped = [], 0, False

    def post(self, url, **kwargs):
        if url != 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions':
            raise QualificationStopped('external business request blocked')
        if self.stopped or len(self.attempts) >= self.budget:
            raise QualificationStopped('qualification stopped or budget exhausted')
        if self.attempts:
            self.sleeper(self.spacing)
        payload = kwargs.get('json') or {}
        row = {'attempt': len(self.attempts)+1, 'model': payload.get('model'),
            'context_chars': sum(len(str(m.get('content') or '')) for m in payload.get('messages', [])),
            'tool_schema_chars': len(str(payload.get('tools') or []))}
        self.attempts.append(row)  # Increment BEFORE the network boundary.
        started = time.monotonic()
        try:
            response = self.sender(url, **kwargs)
            row['http_status'] = response.status_code
            if response.status_code >= 400:
                self.consecutive_errors += 1
            else:
                self.consecutive_errors = 0
                body = response.json()
                row['usage'] = body.get('usage') or {}
                # Generated proposals only. Never store headers or credentials.
                message = (body.get('choices') or [{}])[0].get('message') or {}
                row['proposal'] = {'content': message.get('content'),
                    'tool_calls': [{key: call.get(key) for key in ('id', 'type', 'function')}
                        for call in message.get('tool_calls') or []]}
            return response
        except Exception as exc:
            self.consecutive_errors += 1
            row['error_type'] = type(exc).__name__
            raise
        finally:
            row['latency_ms'] = round((time.monotonic()-started)*1000, 2)
            self.stopped |= self.consecutive_errors >= 2
