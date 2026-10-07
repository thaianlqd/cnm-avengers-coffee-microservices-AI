"""Immutable provider destination identity and checkout drift checks."""
from copy import deepcopy
import hashlib
import json
import math


def fingerprint(destination):
    payload = {key: destination.get(key) for key in
        ('candidate_id', 'provider_ref_id', 'display_address', 'lat', 'lng', 'source')}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def from_candidate(candidate):
    address = candidate.get('display_address') or candidate.get('normalized_label')
    try:
        lat, lng = float(candidate['lat']), float(candidate['lng'])
    except (ValueError, TypeError, KeyError):
        return None
    if not address or not math.isfinite(lat) or not math.isfinite(lng) or not -90 <= lat <= 90 or not -180 <= lng <= 180:
        return None
    destination = deepcopy(candidate)
    destination.update(display_address=address, lat=lat, lng=lng, source='provider_candidate')
    destination['fingerprint'] = fingerprint(destination)
    return destination


def drift(prefs):
    destination = prefs.get('confirmed_destination')
    if prefs.get('delivery_type') != 'GIAO_TAN_NOI' or not destination:
        return False
    return (not prefs.get('address_confirmed') or destination.get('fingerprint') != fingerprint(destination)
        or prefs.get('delivery_address') != destination.get('display_address'))
