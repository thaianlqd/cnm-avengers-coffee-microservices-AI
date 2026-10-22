"""Local replica-worker mailbox. No SQL, credentials or shell commands in requests.

Only the API and the single existing replica worker mount this private volume.
Atomic files and flock coordinate multiple API processes and worker restarts.
"""
import fcntl
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


def root():
    value = os.getenv('DATA_PLATFORM_SYNC_CONTROL_DIR')
    if not value:
        raise RuntimeError('Sync control is not configured')
    path = Path(value)
    path.mkdir(parents=True, exist_ok=True)
    return path


def read(name):
    try:
        path = root() / (name + '.json')
        if path.stat().st_size > 16000:
            return {}
        return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return {}


def write(name, value):
    directory = root()
    temporary = directory / ('.' + uuid4().hex)
    with temporary.open('x') as handle:
        json.dump(value, handle, ensure_ascii=False)
    os.chmod(temporary, 0o600)
    temporary.replace(directory / (name + '.json'))


@contextmanager
def locked():
    with (root() / 'control.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def observe():
    worker = read('worker')
    available = time.time() - worker.get('heartbeat', 0) < 30
    operation = read('operation')
    if operation.get('state') == 'running' and operation.get('worker_id') != worker.get('worker_id'):
        operation = {**operation, 'state':'interrupted', 'error_code':'worker_restarted'}
    return {'configured':True, 'worker_available':available,
            'worker_phase':worker.get('phase', 'unknown'),
            'completed_tables':worker.get('completed_tables',0), 'total_tables':worker.get('total_tables',0),
            'operation':operation or None}


def enqueue():
    with locked():
        status = observe()
        if not status['worker_available']:
            raise RuntimeError('worker_unavailable')
        current = status['operation']
        if current and current.get('state') in {'queued','running'}:
            return current, False
        if current and time.time() - current.get('finished_at',0) < 60:
            raise ValueError('cooldown')
        operation = {'id':'sync_' + uuid4().hex, 'state':'queued',
                     'requested_at':time.time(), 'mode':'full_reconcile'}
        write('operation', operation)
        return operation, True


def claim(worker_id):
    with locked():
        operation = read('operation')
        if operation.get('state') != 'queued':
            return None
        if time.time() - operation.get('requested_at',0) > 600:
            write('operation', {**operation, 'state':'expired', 'finished_at':time.time()})
            return None
        operation.update(state='running', started_at=time.time(), worker_id=worker_id)
        write('operation', operation)
        return operation


def finish(operation, result=None, error_code=None):
    with locked():
        current = read('operation')
        if current.get('id') != operation['id']:
            return
        current.update(state='failed' if error_code else 'partial' if result.get('failed_tables') else 'succeeded',
                       finished_at=time.time())
        if result:
            current['result'] = result
        if error_code:
            current['error_code'] = error_code
        write('operation', current)
