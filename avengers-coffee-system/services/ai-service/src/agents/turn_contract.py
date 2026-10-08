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
    if any(row.get('product_id') for row in visible.get('products', [])):
        return 'PRODUCT_SELECTION'
    return None


def commitment_class(value):
    if value in {'SELECTED', 'AFFIRMED', 'CORRECTION'}:
        return 'COMMIT'
    return value if value in {'QUESTION', 'NEGATED', 'REJECTED', 'HYPOTHETICAL', 'CONDITIONAL'} else None


@dataclass
class TurnContract:
    turn_contract_id: str = field(default_factory=lambda: uuid4().hex)
    goal_family: str | None = None
    goal_owner_operation: str | None = None
    repair_target_operation: str | None = None
    # Migration alias: a retry target only, NEVER ownership/role authority.
    bound_operation: str | None = None
    consultation_operation: str | None = None
    primary_state_obligation: str | None = None
    repair_mode: str = 'NONE'
    must_preserve_facet: str | None = None
    must_preserve_target: tuple | None = None
    repair_reference: dict | None = None
    commitment_class: str | None = None
    scoped_domain: bool = False
    selection_snapshot_locked: bool = False
    writes_already_committed: int = 0
    progress_result: str = 'UNSTARTED'
    turn_completion_reason: str | None = None
    prerequisite_count: int = 0
    interrupt_count: int = 0
    drift_count: int = 0
    context: dict = field(default_factory=dict, repr=False, compare=False)

    @property
    def constrained(self):
        return self.scoped_domain or self.repair_mode in {'PRE_TOOL_RESPONSE_REPAIR', 'SEMANTIC_PROTOCOL_REPAIR', 'POST_TOOL_FINAL_ENVELOPE_REPAIR'}

    @property
    def can_present(self):
        return not self.constrained or self.progress_result in {'COMPLETED', 'BLOCKED'}

    @property
    def repair_target(self):
        return self.repair_target_operation or self.bound_operation

    def primary_operations(self):
        from src.agents.semantic_registry import operation_registry
        registry = operation_registry()
        if self.goal_owner_operation:
            op = registry.get(self.goal_owner_operation)
            return [op] if op and op.goal_family == self.goal_family and op.progress_role in {'PRIMARY', 'FINALIZATION'} else []
        target = registry.get(self.repair_target)
        if target and target.goal_family == self.goal_family and target.progress_role in {'PRIMARY', 'FINALIZATION'}:
            return [target]
        return [op for op in registry.values() if op.goal_family == self.goal_family
            and op.progress_role in {'PRIMARY', 'FINALIZATION'}]

    def needed_prerequisites(self):
        from src.agents.semantic_registry import prerequisite_policies
        return {policy.operation for owner in self.primary_operations()
            for policy in prerequisite_policies(owner.function_name)
            if policy.needed(self.context, self.must_preserve_target, self.repair_reference)}

    def registered_prerequisites(self):
        return {name for owner in self.primary_operations() for name in owner.repair_prerequisites}

    def enter_repair(self, mode, context, plan=None):
        previous_mode = self.repair_mode
        self.repair_mode, self.context = mode, context
        if mode not in {'PRE_TOOL_RESPONSE_REPAIR', 'SEMANTIC_PROTOCOL_REPAIR'}:
            return
        failed = plan.failed if plan else None
        from src.agents.semantic_registry import operation_registry
        if failed and failed.get('operation') in operation_registry():
            proposal = failed['proposal']
            op = operation_registry()[failed['operation']]
            # The already accepted compound journal can establish the failed
            # primary's ownership on FIRST repair. Later prerequisite retries
            # cannot redefine the goal or its owner.
            supporting_active_goal = bool(self.goal_family and op.function_name in self.registered_prerequisites())
            if previous_mode == 'NONE' and not self.scoped_domain and not supporting_active_goal:
                self.goal_family = op.goal_family
                self.goal_owner_operation = op.function_name if op.progress_role in {'PRIMARY', 'FINALIZATION'} else None
            elif not self.goal_family:
                self.goal_family = op.goal_family
            if not self.goal_owner_operation and op.goal_family == self.goal_family and op.progress_role in {'PRIMARY', 'FINALIZATION'}:
                self.goal_owner_operation = op.function_name
            self.repair_target_operation = self.bound_operation = op.function_name
            self.must_preserve_facet = failed.get('facet')
            self.must_preserve_target = failed.get('bound_target')
            self.repair_reference = deepcopy(proposal.get('reference'))
            wire = proposal.get('semantic_payload') or {}
            wire = wire if isinstance(wire, dict) else {}
            self.commitment_class = commitment_class(wire.get('commitment', proposal.get('commitment')))
        elif not self.goal_family:
            self.primary_state_obligation = state_obligation(context)
            self.goal_family = self.primary_state_obligation or 'GENERIC_CONSULTATION'
        if (mode == 'PRE_TOOL_RESPONSE_REPAIR' and self.goal_family == 'PRODUCT_SELECTION'
                and context.get('turn_product_snapshot', {}).get('ordered_product_ids')):
            self.goal_owner_operation = 'semantic_select_product'
            self.selection_snapshot_locked = True
        self.progress_result, self.turn_completion_reason = 'NEEDS_REPAIR', None

    def observe_operation(self, op, standalone=False):
        """Accept metadata meaning; a prerequisite never acquires goal ownership."""
        if not self.goal_family:
            self.goal_family = op.goal_family
        if op.goal_family != self.goal_family:
            return
        if op.progress_role in {'PRIMARY', 'FINALIZATION'} and not self.goal_owner_operation:
            self.goal_owner_operation = op.function_name
        elif standalone and not self.constrained and op.access == 'READ':
            self.consultation_operation = op.function_name

    def allowed_operations(self):
        from src.agents.semantic_registry import operation_registry
        registry = operation_registry()
        if self.consultation_operation and not self.goal_owner_operation:
            return {self.consultation_operation}
        target = registry.get(self.repair_target)
        if target and not self.scoped_domain and not self.goal_owner_operation and target.goal_family == self.goal_family and target.progress_role not in {'PRIMARY', 'FINALIZATION'}:
            return {target.function_name}
        owners = self.primary_operations()
        if owners:
            return {op.function_name for op in owners} | self.needed_prerequisites()
        # A domain containing ONLY consultation operations is explicitly a
        # read-only goal. Retry binding cannot turn its role into PRIMARY.
        return {op.function_name for op in registry.values() if op.goal_family == self.goal_family
            and op.progress_role == 'CONSULTATION'}

    def eligibility(self, op, proposal=None):
        if not self.constrained:
            return True, None
        if self.repair_mode == 'POST_TOOL_FINAL_ENVELOPE_REPAIR':
            return False, 'final_envelope_only'
        if op is None or op.function_name not in self.allowed_operations():
            reason = ('unneeded_prerequisite' if op and op.function_name in self.registered_prerequisites()
                else 'operation_outside_turn_contract')
            return False, reason
        if op.function_name == self.repair_target and proposal:
            if self.must_preserve_facet is not None and proposal.get('facet') != self.must_preserve_facet:
                return False, 'facet_changed'
            if self.commitment_class and commitment_class(proposal.get('commitment')) not in {None, self.commitment_class}:
                return False, 'commitment_class_changed'
        return True, None

    def is_prerequisite(self, op):
        # Classification is independent of retry binding, plan index and
        # interrupt. A cross-domain registered support operation keeps its role.
        return (op.goal_family != self.goal_family or op.progress_role == 'PREREQUISITE'
            or op.function_name in self.registered_prerequisites()
                and op.function_name not in {owner.function_name for owner in self.primary_operations()})

    def interrupt(self, domain, plan=None):
        if domain == self.goal_family:
            return False, 'same_domain_interrupt'
        if self.repair_mode == 'POST_TOOL_FINAL_ENVELOPE_REPAIR':
            return False, 'final_envelope_only'
        if domain not in GOAL_FAMILIES or self.interrupt_count >= 1:
            return False, 'interrupt_budget_exhausted'
        if plan and plan.pending:
            return False, 'unfinished_semantic_plan'
        if self.writes_already_committed:
            return False, 'committed_plan_cannot_switch'
        if self.selection_snapshot_locked:
            return False, 'frozen_selection_goal'
        self.interrupt_count += 1
        self.goal_family, self.goal_owner_operation = domain, None
        self.repair_target_operation = self.bound_operation = self.consultation_operation = None
        self.must_preserve_facet = self.must_preserve_target = self.commitment_class = self.repair_reference = None
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
    contract.context = context
    if contract.repair_target:
        op = operation_registry()[contract.repair_target]
        if op.executor in allowed and op not in operations:
            operations.append(op)
    return [op for op in operations if contract.eligibility(op)[0]]


def validate_turn_progress(contract, op, result, plan=None, before=None, after=None, artifacts=None, accepted_for_contract=False):
    """Goal + exact role + authoritative result + plan closure, never status alone."""
    allowed, reason = (True, None) if accepted_for_contract else contract.eligibility(op)
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
    direct_consultation = (not contract.goal_owner_operation and
        (contract.consultation_operation == op.function_name or
            not contract.primary_operations() and op.progress_role == 'CONSULTATION' and op.goal_family == contract.goal_family))
    if contract.constrained and contract.is_prerequisite(op) and not direct_consultation:
        return 'PREREQUISITE_COMPLETED', 'registered_prerequisite_only'
    if contract.constrained and op.name == 'SELECT_PRODUCT' and after is not None:
        intended = {row['bound_target'][2] for row in plan.actions
            if row.get('operation') == op.function_name and row.get('bound_target')} if plan else set()
        selected = {str(row.get('product_id')) for row in after.get('pending_products', [])}
        selected |= {str(row.get('product_id')) for row in (after.get('cart') or {}).get('items', [])}
        if not intended or not intended <= selected:
            return 'NON_PROGRESS', 'selected_product_state_missing'
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
    if contract.constrained and not direct_consultation and (
            op.goal_family != contract.goal_family or op.progress_role not in {'PRIMARY', 'FINALIZATION'}
            or not op.terminal_for_goal):
        return 'NON_PROGRESS', 'primary_completion_not_proven'
    return 'COMPLETED', 'goal_authority_and_plan_complete'
