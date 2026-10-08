"""Server-owned continuity proof. No utterance, model judge or text classifier."""
from copy import deepcopy
from dataclasses import dataclass, field
from uuid import uuid4
from src.agents.semantic_progress import GOAL_FAMILIES, NORMAL_COMPANION_GOALS

SUCCESS = {'ok', 'success', 'already_processed', 'require_confirmation', 'not_found',
    'no_applicable_voucher', 'empty_cart', 'need_branch_selection'}


def state_obligation(context):
    """Strongest unfinished server milestone, explicitly NOT current user intent."""
    state = context.get('business') or {}
    checkout = state.get('checkout') or {}
    visible = context.get('visible') or {}
    pending = state.get('pending') or {}
    if checkout.get('order_management_action'):
        return 'ORDER_CHANGE'
    if checkout.get('checkout_action_id'):
        return 'CHECKOUT'
    if state.get('pending_products'):
        return 'PRODUCT_CONFIGURATION'
    if checkout.get('pending_cart_option_edit'):
        return 'CART_EDIT'
    if checkout.get('voucher_offer_pending') or pending.get('type') == 'select_voucher':
        return 'VOUCHER'
    if checkout.get('checkout_requested') or checkout.get('voucher_decided'):
        if not checkout.get('delivery_type'):
            return 'FULFILLMENT'
        if (checkout.get('profile_location_offer') or visible.get('location_candidates') or
                checkout.get('delivery_type') == 'GIAO_TAN_NOI' and not checkout.get('address_confirmed') or
                checkout.get('delivery_type') in {'MANG_DI', 'TAI_CHO'} and not (state.get('cart') or {}).get('branch_id')):
            return 'LOCATION'
        if not checkout.get('payment_method'):
            return 'PAYMENT'
        return 'CHECKOUT'
    return None


def commitment_class(value):
    if value in {'SELECTED', 'AFFIRMED', 'CORRECTION'}:
        return 'COMMIT'
    return value if value in {'QUESTION', 'NEGATED', 'REJECTED', 'HYPOTHETICAL', 'CONDITIONAL'} else None


@dataclass
class TurnContract:
    turn_contract_id: str = field(default_factory=lambda: uuid4().hex)
    goal_family: str | None = None
    primary_state_obligation: str | None = None
    repair_mode: str = 'NONE'
    bound_operation: str | None = None
    must_preserve_facet: str | None = None
    must_preserve_target: tuple | None = None
    commitment_class: str | None = None
    scoped_domain: bool = False
    writes_already_committed: int = 0
    progress_result: str = 'UNSTARTED'
    turn_completion_reason: str | None = None
    prerequisite_count: int = 0
    interrupt_count: int = 0
    drift_count: int = 0

    @property
    def constrained(self):
        return self.scoped_domain or self.repair_mode in {'PRE_TOOL_RESPONSE_REPAIR', 'SEMANTIC_PROTOCOL_REPAIR', 'POST_TOOL_FINAL_ENVELOPE_REPAIR'}

    @property
    def can_present(self):
        return not self.constrained or self.progress_result in {'COMPLETED', 'BLOCKED'}

    def enter_repair(self, mode, context, plan=None):
        self.repair_mode = mode
        if mode not in {'PRE_TOOL_RESPONSE_REPAIR', 'SEMANTIC_PROTOCOL_REPAIR'}:
            return
        failed = plan.failed if plan else None
        from src.agents.semantic_registry import operation_registry
        if failed and failed.get('operation') in operation_registry():
            proposal = failed['proposal']
            op = operation_registry()[failed['operation']]
            self.goal_family, self.bound_operation = op.goal_family, op.function_name
            self.must_preserve_facet = failed.get('facet')
            self.must_preserve_target = failed.get('bound_target')
            wire = proposal.get('semantic_payload') or {}
            wire = wire if isinstance(wire, dict) else {}
            self.commitment_class = commitment_class(wire.get('commitment', proposal.get('commitment')))
        elif not self.goal_family:
            self.primary_state_obligation = state_obligation(context)
            self.goal_family = self.primary_state_obligation or 'GENERIC_CONSULTATION'
        self.progress_result, self.turn_completion_reason = 'NEEDS_REPAIR', None

    def allowed_operations(self):
        from src.agents.semantic_registry import operation_registry
        registry = operation_registry()
        if self.bound_operation:
            op = registry[self.bound_operation]
            return {op.function_name, *op.repair_prerequisites}
        primary = [op for op in registry.values() if self.goal_family in op.repair_compatible_goals
            and (not self.primary_state_obligation or self.scoped_domain
                or op.progress_role in {'PRIMARY', 'FINALIZATION'})]
        return {op.function_name for op in primary} | {n for op in primary for n in op.repair_prerequisites}

    def eligibility(self, op, proposal=None):
        if not self.constrained:
            return True, None
        if self.repair_mode == 'POST_TOOL_FINAL_ENVELOPE_REPAIR':
            return False, 'final_envelope_only'
        if op is None or op.function_name not in self.allowed_operations():
            return False, 'operation_outside_turn_contract'
        if op.function_name == self.bound_operation and proposal:
            if self.must_preserve_facet is not None and proposal.get('facet') != self.must_preserve_facet:
                return False, 'facet_changed'
            if self.commitment_class and commitment_class(proposal.get('commitment')) not in {None, self.commitment_class}:
                return False, 'commitment_class_changed'
        return True, None

    def is_prerequisite(self, op):
        if self.bound_operation:
            return op.function_name != self.bound_operation
        return (op.goal_family != self.goal_family or op.progress_role == 'PREREQUISITE'
            or bool(self.primary_state_obligation) and not self.scoped_domain
                and op.progress_role not in {'PRIMARY', 'FINALIZATION'})

    def interrupt(self, domain, plan=None):
        if self.repair_mode == 'POST_TOOL_FINAL_ENVELOPE_REPAIR':
            return False, 'final_envelope_only'
        if domain not in GOAL_FAMILIES or self.interrupt_count >= 1:
            return False, 'interrupt_budget_exhausted'
        if plan and plan.pending:
            return False, 'unfinished_semantic_plan'
        if self.writes_already_committed:
            return False, 'committed_plan_cannot_switch'
        self.interrupt_count += 1
        self.goal_family, self.bound_operation = domain, None
        self.must_preserve_facet = self.must_preserve_target = self.commitment_class = None
        self.scoped_domain = True
        self.progress_result, self.turn_completion_reason = 'INTERRUPT_PENDING', None
        return True, None


def normal_operations_for_context(context, allowed):
    from src.agents.semantic_registry import operations_for_context
    operations = operations_for_context(context, allowed)
    obligation = state_obligation(context)
    if not obligation:
        return operations
    goals = {obligation, *NORMAL_COMPANION_GOALS.get(obligation, ())}
    return [op for op in operations if op.goal_family in goals]


def repair_operations_for_contract(contract, context, allowed):
    from src.agents.semantic_registry import operations_for_context
    # A failed operation remains retryable even if its normal exposure predicate
    # became false. Executor/business authorization is still independently checked.
    from src.agents.semantic_registry import operation_registry
    operations = operations_for_context(context, allowed)
    if contract.bound_operation:
        op = operation_registry()[contract.bound_operation]
        if op.executor in allowed and op not in operations:
            operations.append(op)
    return [op for op in operations if contract.eligibility(op)[0]]


def validate_turn_progress(contract, op, result, plan=None, before=None, after=None, artifacts=None):
    """Goal + exact role + authoritative result + plan closure, never status alone."""
    allowed, reason = contract.eligibility(op)
    if not allowed:
        return 'NON_PROGRESS', reason
    if result.get('recovery_kind') == 'model_repair':
        return 'NEEDS_REPAIR', 'model_protocol'
    if result.get('status') not in SUCCESS and not (
            result.get('status') == 'needs_options' and op.state_effect == 'pending_product'):
        return 'BLOCKED', 'authoritative_business_clarification'
    authoritative = bool(artifacts and any(row['tool'] == op.executor and
        row['result'].get('status') == result.get('status') for row in artifacts.logs))
    if not authoritative:
        return 'NON_PROGRESS', 'authoritative_result_missing'
    if contract.constrained and contract.is_prerequisite(op):
        return 'PREREQUISITE_COMPLETED', 'registered_prerequisite_only'
    if contract.constrained and after is not None and result.get('status') in {'ok', 'success'}:
        checkout = after.get('checkout') or {}
        milestones = {'payment_method': checkout.get('payment_method'),
            'delivery_type': checkout.get('delivery_type'),
            'branch_id': (after.get('cart') or {}).get('branch_id'),
            'checkout_summary': checkout.get('checkout_action_id')}
        if op.state_effect in milestones and not milestones[op.state_effect]:
            return 'NON_PROGRESS', 'authoritative_state_milestone_missing'
        if (op.name in {'CONFIGURE_PRODUCT', 'USE_PRODUCT_DEFAULTS'} and before is not None
                and result.get('changed') is not False
                and before.get('pending_products') == after.get('pending_products')
                and (before.get('cart') or {}).get('items') == (after.get('cart') or {}).get('items')):
            return 'NON_PROGRESS', 'configured_cart_state_unchanged'
    if op.goal_family == 'DISCOVERY' and artifacts:
        from src.agents.tool_artifacts import DISCOVERY_TOOLS, discovery_signature
        completed_reads = {discovery_signature(row['tool'], row['args']) for row in artifacts.logs
            if row['tool'] in DISCOVERY_TOOLS and row['result'].get('status') in {'ok', 'not_found'}
            and row['result'].get('recovery_kind') != 'model_repair'}
        discovery_pending = (artifacts.semantic_discovery_requires_continuation or
            artifacts.planned_discovery_reads > len(completed_reads))
    else:
        discovery_pending = False
    if discovery_pending:
        return 'PROGRESSED', 'declared_discovery_or_selection_continues'
    if plan and any(row['status'] not in {'SUCCEEDED', 'ALREADY_PROCESSED', 'SKIPPED'}
            for row in plan.actions):
        return 'PROGRESSED', 'plan_actions_remain'
    return 'COMPLETED', 'goal_authority_and_plan_complete'
