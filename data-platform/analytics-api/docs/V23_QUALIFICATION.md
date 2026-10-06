# V2.3 qualification evidence

Date: 2026-10-06. Branch `branch_thaian`; HEAD `a5c238eae340b15979614fe5f2c3cb4193cb3af2` remained unchanged.

All backend runs used `AI_OFFLINE=1 PYTHONDONTWRITEBYTECODE=1 /private/tmp/data-platform-ai-v21-venv/bin/python`. Network/DB guards and mocked provider transports prohibit real provider/warehouse access in the new qualification cases.

| Command / scope | Result |
|---|---|
| Backend baseline: `python -m unittest discover -s tests` | 292 passed; 25.767 s |
| Backend final: same discovery command | 316 passed; 39.521 s |
| `python tools/agent_matrix_v23.py` | 24/24 passed; twelve recorded proposal/approval/refinement/failure costs |
| `python tools/analysis_matrix.py --output docs/MANUAL_MATRIX_V23_OFFLINE.json` | 86/86 passed; compiled SQL compared with expected grounded meaning |
| `npm run test:ai-charts` | 8 passed, 0 failed |
| `npm run test:ai-understanding` | 2 passed, 0 failed |
| `npm run test:ai-agent` | 24 passed, 0 failed |
| `npm run typecheck` | Exit 2; same six baseline TS2305 errors; zero introduced errors |
| `npm run build` | Passed; Vite 5.4.21, 62 modules; 2.28 s |
| `docker compose -f docker-compose.data.yml build analytics-api web-ui` | Both final images built; exit 0; no services started/pushed |
| `git -c core.whitespace=cr-at-eol diff --check -- data-platform docker-compose.data.yml` | Passed; original CRLF preserved |
| Hard-coding audit of changed primary production modules | No prompt classifiers, `hints()`/`fast_spec()` calls, specific city or Top 5 phrases |
| Visual browser QA | Not completed: computer-use permission review rejected Chrome; React static render/layout tests passed |

The TypeScript diagnostics were compared line-for-line against the captured baseline. The missing exports are `PipelinesData`, `RealtimeEvent`, `SystemUser`, `SystemRole`, and `SystemLog` in `src/store/usePlatformStore.ts`, plus `RealtimeEvent` in `src/views/StreamingView.tsx`. Vite builds successfully, but this is not a claim that the repository typecheck is clean.

Build outputs: `dist/index.html` 1.41 kB; CSS 44.44 kB (gzip 7.72 kB); JS 360.09 kB (gzip 97.57 kB). No runtime dependency or lockfile change was needed. Docker daemon access and the localhost-only preview were approved for the scoped checks. Chrome inspection was rejected with “Computer Use was not approved to use Google Chrome”. The preview files were removed and its process stopped.

## Files changed

The starting Data Platform tree was clean. All implementation edits/additions are inside `data-platform/**`; `docker-compose.data.yml` has no diff. Existing root environment/compose/chatbot changes were preserved and are excluded from this list.

- `data-platform/.env.example`
- `data-platform/analytics-api/docs/AGENT_MATRIX_V23_OFFLINE.json`
- `data-platform/analytics-api/docs/AI_V23_IMPLEMENTATION.md`
- `data-platform/analytics-api/docs/MANUAL_MATRIX_V23_OFFLINE.json`
- `data-platform/analytics-api/docs/V23_QUALIFICATION.md`
- `data-platform/analytics-api/routers/ai.py`
- `data-platform/analytics-api/services/agent_pipeline.py`
- `data-platform/analytics-api/services/agent_provider.py`
- `data-platform/analytics-api/services/analysis_pipeline.py`
- `data-platform/analytics-api/services/analyst_contract.py`
- `data-platform/analytics-api/services/analytical_query_service.py`
- `data-platform/analytics-api/services/analytical_tool_contract.py`
- `data-platform/analytics-api/services/dashboard_planner_service.py`
- `data-platform/analytics-api/services/data_analyst_agent.py`
- `data-platform/analytics-api/services/explanation_service.py`
- `data-platform/analytics-api/services/insight_service.py`
- `data-platform/analytics-api/services/semantic_tools.py`
- `data-platform/analytics-api/tests/agent_fixtures.py`
- `data-platform/analytics-api/tests/test_agent_v22.py`
- `data-platform/analytics-api/tests/test_agent_v23.py`
- `data-platform/analytics-api/tools/agent_matrix_v23.py`
- `data-platform/analytics-api/tools/analysis_matrix.py`
- `data-platform/web-ui/package.json`
- `data-platform/web-ui/src/components/AnalysisClarification.tsx`
- `data-platform/web-ui/src/components/AnalysisMeaning.tsx`
- `data-platform/web-ui/src/components/AnalystDashboardSummary.tsx`
- `data-platform/web-ui/src/components/Charts.tsx`
- `data-platform/web-ui/src/utils/analysisPresentation.d.ts`
- `data-platform/web-ui/src/utils/analysisPresentation.mjs`
- `data-platform/web-ui/src/utils/analystDashboard.test.mjs`
- `data-platform/web-ui/src/views/AnalyticsView.tsx`

The boundary/canonicalizer, agent loop, discovery, pipeline and HTTP facade implement contract repair and status attribution. Dashboard/evidence services implement coverage, units and grounded presentation. UI components/utilities implement scope review, responsive grouped views, table pagination and error headings. Tests/fixture helpers/matrix tools document and verify these behaviors. `.env.example` adds only bounded repair/supporting budget examples; `package.json` adds the project typecheck command.

REAL PROVIDER CALLS: 0.

EMBEDDING CALLS: 0.

LIVE WAREHOUSE QUERIES: 0.

LIVE WAREHOUSE MUTATIONS: 0.

NO COMMIT PERFORMED.

NO PUSH PERFORMED.
