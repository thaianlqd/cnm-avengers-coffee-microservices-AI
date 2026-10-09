"""Versioned public verification contract; no model confidence/probability."""
from typing import Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract

VERSION = '2.8.5'

class ScorePart(Contract):
    id: str
    label: str
    earned_points: float = Field(ge=0)
    possible_points: float = Field(ge=0)
    status: Literal['passed', 'partial', 'failed', 'not_applicable', 'not_measured']

class ScoreMethod(Contract):
    id: str = 'verification_evidence_v1'
    label: str = 'Điểm kiểm chứng tổng'
    formula: str = '90 × trung bình có trọng số các kiểm tra áp dụng + 10 × tỷ lệ khớp đối chứng độc lập. Chưa đo đối chứng: chưa cộng 10 điểm; kiểm tra không áp dụng không bị trừ.'
    unmeasured_points: float = Field(default=10, ge=0, le=100)
    interpretation: str = 'Chỉ số mức độ kiểm chứng theo trọng số quy định; không phải độ chính xác hay xác suất AI trả lời đúng.'

class VerificationCheck(Contract):
    id: str
    label: str
    passed: int = Field(ge=0)
    total: int = Field(ge=0)
    status: Literal['passed', 'partial', 'failed', 'not_applicable']
    summary: str

class AccuracyAssessment(Contract):
    status: Literal['not_measured', 'measured'] = 'not_measured'
    matched_count: Optional[int] = Field(default=None, ge=0)
    reference_count: int = Field(default=0, ge=0)
    accuracy_pct: Optional[float] = Field(default=None, ge=0, le=100)
    reference_source: Optional[str] = None
    reason: str = 'Chưa có đáp án đối chứng độc lập cho yêu cầu này; không suy ra độ chính xác từ các kiểm tra nội bộ.'

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
    score: Optional[int | float] = Field(default=None, ge=0, le=100)
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
    measurement_mode: Literal['evidence_checks', 'legacy_weighted_checks'] = 'legacy_weighted_checks'
    verification_checks: list[VerificationCheck] = Field(default_factory=list)
    score_method: Optional[ScoreMethod] = None
    score_breakdown: list[ScorePart] = Field(default_factory=list)
    accuracy_assessment: AccuracyAssessment = Field(default_factory=AccuracyAssessment)
    confidence_probability: Optional[float] = Field(default=None, ge=0, le=1)
    confidence_reason: str = 'Chưa hiệu chuẩn xác suất trả lời đúng trên tập đối chứng độc lập; không công bố xác suất tin cậy.'
