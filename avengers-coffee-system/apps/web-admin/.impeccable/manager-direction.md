# Manager operations direction

Mode: Operate. Code-first extension of the reviewed System Admin visual system; no new visual world.

User-confirmed contract: System Admin is the ongoing design standard for all Web Admin roles. Navy sidebar and active controls, sky focus, readable Vietnamese, shadcn/Radix controls and semantic status badges. One content title with a breadcrumb-only header. Preserve existing order/payment/dispatch/attendance/closing business callbacks and permission gates. Exactly four overview charts in a 2×2 desktop grid, based on loaded real data and explicit historical-period fallback. No statistic-card scaffolds outside overview. Lists, tables, financial definition rows and disclosures carry operational information.

Manager scope: overview; compact order workflow; POS service/payment dropdowns and separate receipt; menu grid/table with an accessible iOS-style Radix Switch; delivery orders/COD/branch driver tabs; closing and approval tables; employee table and actual store staff creation; weekly staffing calendar; driver dispatch/exception/KPI tables; customer chat spacing. Shared secondary panels inherit the same shell and controls.

Employee correction explicitly requested: create STAFF at the authenticated Manager's branch, not KIOSK_STAFF. Identity endpoint forces role and branch server-side, retaining the original kiosk endpoint. Four security/validation tests cover this path.

Verification: actual component tree rendered at localhost in an isolated, visibly labelled fixture (no operational data writes). Fixture data is illustrative and never shipped in application entry points. Production authenticated API journeys were not exercised without a signed-in Manager session. Screenshots and verification matrix live under .impeccable/review/manager/. UI behavior tests cover callbacks, permission/financial guards, one-title hierarchy, dropdowns, switches and calendar selection.
