"""Owned module APIs; mutations save metadata only, warehouse execution is read-only."""
from typing import Optional
from fastapi import APIRouter, Request, Response, Query
from pydantic import BaseModel, ConfigDict, Field
from common import AiTimeRange, AiAnalysisScope
from services.browser_owner import browser_owner
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_module_service import AnalysisModules

router = APIRouter(prefix="/api/ai/modules", tags=["Analysis Modules"])

class SaveModule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str = Field(min_length=1,max_length=100)
    revision: Optional[int] = None
    name: str = Field(min_length=1,max_length=120)
    description: str = Field(default="",max_length=500)
    parameterizable_scope: bool = False

class PatchModule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(default=None,min_length=1,max_length=120)
    archived: Optional[bool] = None

class RerunModule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    time: Optional[AiTimeRange] = None
    scope: Optional[AiAnalysisScope] = None


def invoke(request,response,action):
    pipeline = AnalysisPipeline(owner_id=browser_owner(request,response))
    modules = AnalysisModules(pipeline.module_repository)
    try: return action(modules,pipeline)
    except Exception as e: return safe_failure(e,pipeline.calls,pipeline.semantic_info)

@router.get("")
def list_modules(request: Request,response: Response,search: str = Query(default="",max_length=120)):
    return invoke(request,response,lambda m,p: {"status":"success","modules":m.list(p.owner_id,search,p.catalog())})

@router.get("/{module_id}")
def get_module(module_id: str,request: Request,response: Response):
    return invoke(request,response,lambda m,p: {"status":"success","module":m.public(m.repository.get(p.owner_id,module_id),p.catalog())})

@router.post("")
def save_module(payload: SaveModule,request: Request,response: Response):
    return invoke(request,response,lambda m,p: {"status":"success","module":m.save(p,payload.session_id,payload.name,payload.description,payload.revision,payload.parameterizable_scope)})

@router.patch("/{module_id}")
def patch_module(module_id: str,payload: PatchModule,request: Request,response: Response):
    from services.analysis_module_service import safe_text
    return invoke(request,response,lambda m,p: {"status":"success","module":m.public(m.repository.patch(p.owner_id,module_id,safe_text(payload.name) if payload.name is not None else None,payload.archived),p.catalog())})

@router.delete("/{module_id}")
def archive_module(module_id: str,request: Request,response: Response):
    return invoke(request,response,lambda m,p: {"status":"success","module":m.public(m.repository.patch(p.owner_id,module_id,archived=True),p.catalog())})

@router.post("/{module_id}/rerun")
def rerun_module(module_id: str,payload: RerunModule,request: Request,response: Response):
    return invoke(request,response,lambda m,p: m.rerun(p,module_id,payload.time.model_dump(mode="json") if payload.time else None,payload.scope.model_dump(mode="json") if payload.scope else None))

@router.get("/{module_id}/runs/{report_id}")
def previous_module_report(module_id: str,report_id: str,request: Request,response: Response):
    return invoke(request,response,lambda m,p: m.previous_report(p,module_id,report_id))
