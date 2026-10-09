"""Location business adapter for already interpreted literals, no language router."""
from copy import deepcopy
import re
from src.common import cart_manager
from src.function_calling.tools import branch_tools
from src.agents.agent_context import business_state
from src.agents.confirmed_destination import from_candidate
from src.agents.tool_artifacts import candidate_id
from src.agents.location_parser import parse_location, complete_partial_delivery_address


def delivery_address(previous, value):
    """A new numbered street wins; only explicit admin fragments extend it."""
    parsed = parse_location(value)
    if parsed.kind == 'address' or not previous:
        return parsed
    completed = complete_partial_delivery_address(previous, value)
    if completed:
        return completed
    old = parse_location(previous)
    components = [part.strip() for part in value.split(',') if part.strip()]
    if old.kind == 'address' and old.missing and components and all(re.match(
            r'^(?:phường|xã|quận|huyện|thành phố|tỉnh|p\.|q\.|tp\.?)\s*\S+', part, re.IGNORECASE)
            for part in components):
        return parse_location(old.value + ', ' + value)
    return parsed


def resolve(gateway, args):
    sid, prefs = gateway.session_id, cart_manager.get_checkout_prefs(gateway.session_id)
    target = (gateway.active_semantic or {}).get('canonical_target') or {}
    reference = (gateway.active_semantic or {}).get('reference') or {}
    if reference.get('namespace') == 'PROFILE_ADDRESS':
        if prefs.get('confirmed_destination') and (gateway.active_semantic or {}).get('commitment') != 'CORRECTION':
            return {'status': 'confirmed_destination_change_required', 'message': 'Bạn nói rõ muốn đổi địa chỉ đã xác nhận nhé.'}
        if not target.get('full_address') or args['location'] != target['full_address']:
            return {'status': 'profile_address_not_grounded', 'message': 'Bạn chọn địa chỉ trong danh sách đã lưu nhé.'}
    fulfillment = prefs.get('delivery_type')
    delivery = bool(args.get('for_checkout') and fulfillment == 'GIAO_TAN_NOI')
    value, kind = args['location'], args['kind']
    if delivery:
        parsed = delivery_address(prefs.get('partial_delivery_address'), value)
        if not parsed or parsed.kind != 'address' or parsed.missing:
            partial = parsed.value if parsed and parsed.kind == 'address' else prefs.get('partial_delivery_address') or value
            missing = list(parsed.missing) if parsed and parsed.kind == 'address' else ['số nhà, tên đường', 'phường/xã', 'tỉnh/thành phố']
            cart_manager.set_checkout_context(sid, partial_delivery_address=partial, location_pending=True)
            return {'status': 'need_address_precision', 'missing': missing,
                'message': 'Bạn bổ sung ' + ' và '.join(missing) + ' cho địa chỉ giao nhé.'}
        value = parsed.value
        kind = 'address'
    # Read-only discovery never changes an existing destination or pending owner.
    transactional = delivery or fulfillment in {'MANG_DI', 'TAI_CHO'} and reference.get('namespace') != 'READ_ONLY_LOCATION'
    if transactional:
        gateway._invalidate_summary()
        cart_manager.clear_branch(sid)
        cart_manager.set_checkout_context(sid, profile_location_offer=None, suggested_address=None,
            branch_candidates=None, address_confirmed=None, confirmed_destination=None,
            location_candidate_snapshot=None, selected_location_candidate=None,
            location_pending=True, location_source='explicit_user', checkout_requested=True)
        if (cart_manager.get_pending_action(sid) or {}).get('type') == 'confirm_address':
            cart_manager.clear_pending_action(sid)
    nearest = branch_tools.execute_find_nearest_branch(location=value, session_id=sid if transactional else '',
        cart_items=cart_manager.get_cart(sid).get('items') if transactional else None,
        location_purpose='delivery' if delivery else 'nearby_branches', semantic_location_kind=kind)
    candidates = [{**r, 'candidate_id': candidate_id(r)} for r in nearest.get('location_candidates') or []]
    if candidates:
        if transactional:
            cart_manager.set_checkout_context(sid, location_candidate_snapshot={'candidates': deepcopy(candidates),
                'query': value, 'kind': kind, 'purpose': 'delivery' if delivery else 'nearby_branches'})
            cart_manager.set_pending_action(sid, 'select_location_candidate', {})
        return {**nearest, 'location_candidates': candidates, 'normalized_location': value}
    branches = nearest.get('branches') or []
    if delivery and nearest.get('status') == 'ok' and branches:
        resolved = nearest.get('resolved_location')
        if not resolved:
            return {'status': 'location_not_verified', 'message': 'Bản đồ chưa xác minh địa chỉ giao. Bạn chọn địa điểm chính xác nhé.'}
        resolved = {**resolved, 'display_address': value, 'candidate_id': candidate_id(resolved)}
        destination = from_candidate(resolved)
        if not destination:
            return {'status': 'invalid_location_candidate', 'message': 'Mình chưa xác minh được tọa độ địa chỉ giao.'}
        cart_manager.set_checkout_prefs(sid, delivery_address=destination['display_address'])
        cart_manager.set_checkout_context(sid, confirmed_destination=destination, address_confirmed=True,
            selected_location_candidate=resolved, partial_delivery_address=None, location_pending=None,
            location_state='ADDRESS_CONFIRMED')
        # Existing delivery UX assigns the servicing branch by geo/inventory;
        # pickup/dine-in retain an explicit customer branch decision.
        chosen = branches[0]
        selected = branch_tools.execute_set_session_branch(sid, str(chosen.get('branch_id') or chosen.get('ma_chi_nhanh')),
            chosen.get('branch_name') or chosen.get('ten_chi_nhanh') or '', customer_selected=True)
        gateway.artifacts.collect('set_session_branch', {'branch_id': str(chosen.get('branch_id') or chosen.get('ma_chi_nhanh'))}, selected)
        if selected.get('status') != 'ok':
            return selected
        cart_manager.set_checkout_context(sid, location_state='LOCATION_READY', branch_destination_fingerprint=destination['fingerprint'])
        return {'status': 'ok', 'message': 'Đã xác nhận địa chỉ giao: **' + destination['display_address'] + '**.'}
    if transactional and branches:
        cart_manager.set_checkout_context(sid, branch_candidates=deepcopy(branches), location_pending=None)
        cart_manager.set_pending_action(sid, 'select_branch', {})
    return nearest


def select(gateway, selected_id):
    """Reuse frozen provider coordinates; never re-geocode or replace with profile."""
    sid = gateway.session_id
    prefs = cart_manager.get_checkout_prefs(sid)
    row = (gateway.active_semantic or {}).get('canonical_target') or {}
    current = (prefs.get('location_candidate_snapshot') or {}).get('candidates') or []
    if candidate_id(row) != selected_id or not any(candidate_id(r) == selected_id for r in current):
        return {'status': 'stale_location_candidate', 'message': 'Danh sách địa điểm đã thay đổi. Bạn gửi lại vị trí nhé.'}
    delivery = prefs.get('delivery_type') == 'GIAO_TAN_NOI'
    if not delivery and prefs.get('delivery_type') not in {'MANG_DI', 'TAI_CHO'}:
        return {'status': 'fulfillment_required', 'message': 'Bạn chọn hình thức nhận hàng trước nhé.'}
    destination = from_candidate(row)
    parsed = parse_location(destination['display_address']) if destination and delivery else None
    if not destination or delivery and (not parsed or parsed.kind != 'address' or parsed.missing):
        return {'status': 'incomplete_delivery_address', 'message': 'Bạn bổ sung địa chỉ giao đầy đủ nhé.'}
    gateway._invalidate_summary()
    cart_manager.clear_branch(sid)
    if delivery:
        cart_manager.set_checkout_prefs(sid, delivery_address=destination['display_address'])
        cart_manager.set_checkout_context(sid, confirmed_destination=destination, address_confirmed=True,
            partial_delivery_address=None, location_state='ADDRESS_CONFIRMED')
    cart_manager.set_checkout_context(sid, location_candidate_snapshot=None, selected_location_candidate=deepcopy(row),
        profile_location_offer=None, suggested_address=None, location_pending=None)
    if (cart_manager.get_pending_action(sid) or {}).get('type') in {'select_location_candidate', 'confirm_address'}:
        cart_manager.clear_pending_action(sid)
    gateway.artifacts.visible['location_candidates'] = []
    nearest = branch_tools.execute_find_nearest_branch(location=destination['display_address'], session_id=sid,
        resolved_location=deepcopy(row), semantic_location_kind='address' if delivery else 'poi',
        location_purpose='delivery' if delivery else 'nearby_branches')
    branches = nearest.get('branches') or []
    if not branches or nearest.get('status') not in {'ok', 'need_branch_selection'}:
        return nearest
    if delivery:
        chosen = branches[0]
        result = branch_tools.execute_set_session_branch(sid, str(chosen.get('branch_id') or chosen.get('ma_chi_nhanh')),
            chosen.get('branch_name') or chosen.get('ten_chi_nhanh') or '', customer_selected=True)
        gateway.artifacts.collect('set_session_branch', {'branch_id': str(chosen.get('branch_id') or chosen.get('ma_chi_nhanh'))}, result)
        if result.get('status') != 'ok':
            return result
        cart_manager.set_checkout_context(sid, location_state='LOCATION_READY', branch_destination_fingerprint=destination['fingerprint'])
        return {'status': 'ok', 'message': 'Đã xác nhận địa chỉ giao: **' + destination['display_address'] + '**.'}
    cart_manager.set_checkout_context(sid, branch_candidates=deepcopy(branches))
    cart_manager.set_pending_action(sid, 'select_branch', {})
    return nearest
