# Web Admin · current direction 2026-10-23

Mode: Operate. Build path: code-first.

The latest user screenshots and explicit request supersede the earlier light sidebar and plain-tag interpretation: adopt real shadcn/ui components, a **navy sidebar** with left-aligned group labels and visible pale icons, stronger body text, one primary page heading, selective semantic badges, and separate record information cards inspired by Zenith (https://zenith-shadcn.dashboardpack.com/users/usr-1). Customer branding remains red.

Source: official new-york shadcn registry components copied to src/components/ui, Radix Dialog/Popover, Recharts, DayPicker. Shared Tailwind vocabulary and src/AdminTheme.css bridge all role shells. Preserve existing state/API/event/permission contracts. System Admin gets complete record/shell layout; other roles share primitives and navy shell styling.

Cards describe useful facts, not decorative stacks: product details/image/pricing; employee identity/contact/access; kiosk operations/location/partner and finance; order summary/customer/payment plus line items. The shell owns the title and selected record breadcrumb. Do not repeat the same page introduction inside a list card. Use green confirmed-status badges, gray inactive states and neutral outline roles/categories; keep product attributes and kiosk rank restrained. Save/approve hover is green; cancel/delete is red.

The explicitly authorized functional addition from the previous message remains: city/ward-gated real map address suggestions, invalidation after address edits and exact coordinate persistence in existing vi_do/kinh_do fields for shipper usage. Vietmap v4 is configured on the server; no-key Photon fallback is strictly filtered and may return no results for newly merged wards. Do not fabricate matches. Public 45 Nguyễn Huệ live lookup succeeded; no real branch record was created for tests.

Verification: focused component tests and production builds cover the shadcn migration. Before browser access was disabled, the earlier navy pass was rendered and independently spot-checked. CUA now reports browser use disabled in Work settings, so a final rendered pass of this later shadcn revision is still outstanding. Do not reuse earlier screenshots or failed reviewer verdicts as current proof.

Latest refinement: all status columns share StatusBadge; record actions align to 24px card content. Modal body/frame/footer slots share a gutter with no doubled inset; prefix inputs reserve icon space. Branch actions stay in one 132px slot. Address suggestions use the shared Radix dropdown surface with auto-height rows. Remove the temporary kiosk contract viewer and use the existing top approval confirmation.
