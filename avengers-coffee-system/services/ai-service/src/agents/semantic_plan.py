"""Turn-scoped execution journal. A repair replaces one proposal, never a batch."""
from copy import deepcopy
from uuid import uuid4


TERMINAL = {'SUCCEEDED', 'ALREADY_PROCESSED', 'SKIPPED'}


class SemanticPlan:
    def __init__(self, proposals):
        self.plan_id = uuid4().hex
        self.actions = []
        for index, proposal in enumerate(proposals):
            self.actions.append({'action_id': uuid4().hex, 'original_index': index,
                'tool': proposal.get('tool'), 'operation': proposal.get('operation'),
                'facet': proposal.get('facet'), 'reference': deepcopy(proposal.get('reference')),
                # Conservative dependency order: no sibling runs past an unresolved write.
                'dependencies': [self.actions[-1]['action_id']] if self.actions else [],
                'status': 'PENDING', 'proposal': deepcopy(proposal), 'result': None})

    @property
    def pending(self):
        return [row for row in self.actions if row['status'] not in TERMINAL]

    @property
    def failed(self):
        return next((row for row in self.actions if row['status'] == 'NEEDS_REPAIR'), None)

    def repair(self, proposal):
        row = self.failed
        if not row or row['tool'] and proposal.get('tool') != row['tool']:
            return False
        if row.get('tool') and any(row.get(key) != proposal.get(key) for key in ('operation', 'facet')):
            return False
        reference = row.get('reference') or {}
        if row.get('operation') and reference.get('kind') == 'literal' and (
                proposal.get('reference') or {}).get('value') != reference.get('value'):
            return False
        # A repaired wire representation may change, but never an already bound target.
        row['proposal'] = deepcopy(proposal)
        row['tool'] = proposal.get('tool')
        row['operation'] = proposal.get('operation')
        row['facet'] = proposal.get('facet')
        row['reference'] = deepcopy(proposal.get('reference'))
        row['result'] = None
        row['status'] = 'PENDING'
        return True

    def projection(self):
        return [{key: deepcopy(row[key]) for key in
            ('action_id', 'original_index', 'tool', 'operation', 'facet', 'reference', 'dependencies', 'status')}
            for row in self.actions]
