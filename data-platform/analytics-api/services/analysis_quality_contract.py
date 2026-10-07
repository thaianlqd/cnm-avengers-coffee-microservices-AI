"""Versioned public verification contract; no model confidence/probability."""
from typing import Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract

VERSION = '2.7.1'

class QualityItem(Contract):
    id: str
    label: str
    evidence_refs: list[str] = Field(default_factory=list)

class QualityAction(QualityItem):
    action: Literal['add_history', 'define_metric', 'choose_criterion', 'compare_complete_periods', 'review_evidence', 'review_scope']

class QualityComponent(Contract):
    id: str
    label: str
    score: int = Field(ge=0)
    max_score: int = Field(ge=1)
    status: Literal['passed', 'partial', 'failed', 'not_applicable']
    summary: str
    evidence_refs: list[str] = Field(default_factory=list)

class QualityCoverage(Contract):
    requested_count: int = 0
    completed_count: int = 0
    supporting_count: int = 0
    omitted_count: int = 0

class AnalysisQualityAssessment(Contract):
    score: Optional[int] = Field(default=None, ge=0, le=100)
    grade: Literal['excellent', 'good', 'partial', 'needs_attention'] = 'needs_attention'
    status: Literal['verified', 'partially_verified', 'not_scored']
    components: list[QualityComponent] = Field(default_factory=list)
    completed: list[QualityItem] = Field(default_factory=list)
    missing: list[QualityItem] = Field(default_factory=list)
    unverified: list[QualityItem] = Field(default_factory=list)
    limitations: list[QualityItem] = Field(default_factory=list)
    suggested_next_actions: list[QualityAction] = Field(default_factory=list)
    coverage: QualityCoverage = Field(default_factory=QualityCoverage)
    generated_by: Literal['deterministic_verifier'] = 'deterministic_verifier'
    version: str = VERSION
    reason: Optional[str] = None
