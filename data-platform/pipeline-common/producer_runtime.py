"""Bounded source keyset polling and durable cursor after Kafka acknowledgements.

No CDC guarantee: overlap and independent full scans repair bounded late updates;
created-only/no-clock item sources use recurring full key scans. Source reads
are a per-poll snapshot, never advertised as cross-source atomic or complete.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import time
from uuid import UUID

from pipeline_runtime import canonical_bytes, fingerprint, quote_identifier, quote_table, CheckpointConflict, PipelineContractError


def json_value(value):
    if isinstance(value, datetime): return (value.astimezone(timezone.utc) if value.tzinfo else value).isoformat()
    if isinstance(value, date): return value.isoformat()
    if isinstance(value, (Decimal, UUID)): return str(value)
    if isinstance(value, dict): return {str(k): json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [json_value(v) for v in value]
    return value


def load_cursor(connection, contract):
    with connection.cursor() as cursor:
        cursor.execute('SELECT generation,contract_fingerprint,state FROM analytics.stream_checkpoints WHERE stream_id=%s',
                       (contract['stream_id'],))
        row = cursor.fetchone()
    if row is None: return 0, {}
    if row[1] != fingerprint(contract):
        raise PipelineContractError('Stream contract changed; explicit checkpoint migration required')
    return row[0], row[2]


def save_cursor(connection, contract, state, generation):
    try:
        with connection.cursor() as cursor:
            if generation == 0:
                cursor.execute('INSERT INTO analytics.stream_checkpoints(stream_id,generation,contract_fingerprint,state) '
                    'VALUES (%s,1,%s,%s::jsonb) ON CONFLICT DO NOTHING RETURNING generation',
                    (contract['stream_id'], fingerprint(contract), canonical_bytes(state).decode()))
            else:
                cursor.execute('UPDATE analytics.stream_checkpoints SET state=%s::jsonb,generation=generation+1,'
                    'last_success_at=clock_timestamp() WHERE stream_id=%s AND generation=%s RETURNING generation',
                    (canonical_bytes(state).decode(), contract['stream_id'], generation))
            if cursor.fetchone() is None:
                raise CheckpointConflict('Publisher cursor changed; acknowledged records may replay')
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def poll_stream(producer, source, state_connection, contract, *, limit=500, deadline=None):
    if type(limit) is not int or not 1 <= limit <= 1000:
        raise PipelineContractError('Bounded stream page required')
    deadline = time.monotonic()+45 if deadline is None else deadline
    if time.monotonic() >= deadline: raise TimeoutError('Poll deadline exhausted')
    table, keys = quote_table(contract['source_table']), contract['primary_key']
    columns, clock = contract['columns'], contract.get('update_clock')
    if not keys or not set(keys).issubset(columns) or clock and clock not in columns:
        raise PipelineContractError('Source key/clock missing from explicit stream projection')
    names = ','.join(quote_identifier(name) for name in columns)
    generation, state = load_cursor(state_connection, contract)
    # Release the state read transaction before waiting on an external broker.
    state_connection.rollback()
    try:
        with source.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout='15s'")
            cursor.execute('SELECT clock_timestamp()')
            upper = cursor.fetchone()[0]
            clock_sql = quote_identifier(clock) if clock else None
            if clock and contract.get('clock_type') == 'timestamp without time zone':
                clock_sql += " AT TIME ZONE current_setting('TimeZone')"
            active = state.get('active')
            if active is None:
                full = (not clock or not state.get('last_full_at') or
                    (upper-datetime.fromisoformat(state['last_full_at'])).total_seconds() >= contract['full_reconcile_seconds'])
                lower = None if full else (datetime.fromisoformat(state['completed_upper'])-
                    timedelta(seconds=contract['overlap_seconds'])).isoformat()
                active = {'full': full, 'upper': upper.isoformat(), 'lower': lower, 'after': None}
            predicates, params = [], []
            order = ([clock_sql] if clock else [])+[quote_identifier(k) for k in keys]
            if clock:
                predicates.append('('+clock_sql+') <= %s::timestamptz')
                params.append(active['upper'])
                if active['lower']:
                    predicates.append('('+clock_sql+') >= %s::timestamptz')
                    params.append(active['lower'])
            if active['after']:
                placeholders = (['%s::timestamptz'] if clock else [])+['%s']*len(keys)
                predicates.append('('+','.join(order)+') > ('+','.join(placeholders)+')')
                params.extend(active['after'])
            query = 'SELECT '+names+(' ,('+clock_sql+') AS _source_clock' if clock else '')+' FROM '+table
            if predicates: query += ' WHERE '+' AND '.join(predicates)
            query += ' ORDER BY '+','.join(order)+' LIMIT %s'
            cursor.execute(query, (*params, limit))
            field_names = [item[0] for item in cursor.description]
            rows = [dict(zip(field_names, row)) for row in cursor.fetchall()]
        for row in rows:
            if time.monotonic() >= deadline: raise TimeoutError('Poll delivery deadline exhausted')
            version = row.pop('_source_clock', None)
            data = json_value(row)
            identity = {'source': contract['source_table'], 'keys': [data[k] for k in keys],
                        'version': json_value(version), 'row_fingerprint': fingerprint(data)}
            event = {'producer_version': '3.4.0', 'event_id': fingerprint(identity),
                     'event_type': contract['event_type'], 'source': contract['source_table'], 'data': data}
            future = producer.send(contract['stream_id'], key=fingerprint(identity['keys']), value=event)
            future.get(timeout=max(0.001, min(5, deadline-time.monotonic())))
        # An acknowledged full page retains the upper window and composite
        # position. Tied clocks cannot disappear at a LIMIT boundary.
        result = dict(state)
        if len(rows) == limit:
            last = rows[-1]
            last_clock = last.get(clock) if clock else None
            if clock and last_clock.tzinfo is None:
                # Use the normalized PostgreSQL expression, not host timezone.
                # Re-read only the boundary expression in this same snapshot.
                with source.cursor() as cursor:
                    cursor.execute('SELECT ('+clock_sql+') FROM '+table+' WHERE '+
                        ' AND '.join(quote_identifier(k)+'=%s' for k in keys), tuple(last[k] for k in keys))
                    last_clock = cursor.fetchone()[0]
            active['after'] = ([json_value(last_clock)] if clock else [])+[json_value(last[k]) for k in keys]
            result['active'] = active
        else:
            result.update(active=None, completed_upper=active['upper'])
            if active['full']: result['last_full_at'] = active['upper']
        result['completeness'] = 'unknown'
        save_cursor(state_connection, contract, result, generation)
        return {'published': len(rows), 'has_more': result.get('active') is not None, 'completeness': 'unknown'}
    finally:
        source.rollback()
