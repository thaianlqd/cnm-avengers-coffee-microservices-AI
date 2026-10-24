---
name: Avengers Coffee — Web Admin
description: Shared shadcn/ui controls, navy navigation and clear enterprise record details.
colors:
  primary: '#16354d'
  primary-hover: '#0f4d70'
  primary-light: '#eef7fc'
  primary-subtle: '#dceef8'
  surface: '#fff'
  canvas: '#f6f8fa'
  ink: '#142b3e'
  body: '#263c50'
  muted: '#526174'
  border: '#e2e8f0'
  divider: '#edf1f5'
  nav-text: '#dce7ef'
  nav-muted: '#a8c1d3'
  nav-hover: '#1a3c55'
  row-hover: '#f3f8fc'
  success: '#22833d'
  success-bg: '#22833d'
  success-border: '#22833d'
  sky: '#0284c7'
  nav: '#102b40'
  nav-active: '#164e70'
  danger: '#b91c1c'
typography:
  headline:
    fontFamily: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  headline-mobile:
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  title:
    fontSize: 16px
    fontWeight: 600
  body:
    fontFamily: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
    fontSize: 14px
    fontWeight: 450
    lineHeight: 1.6
  description:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontSize: 13px
    fontWeight: 500
  field:
    fontSize: 14px
    fontWeight: 450
    lineHeight: 1.5
  field-mobile:
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: 13px
    fontWeight: 500
  caption:
    fontSize: 12px
  code:
    fontFamily: ui-monospace, SFMono-Regular, Consolas, monospace
    fontSize: 11px
    fontWeight: 600
  metric:
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.025em'
rounded:
  badge: 5px
  tab: 5px
  control: 6px
  surface: 12px
  dialog: 10px
spacing:
  tight: 8px
  compact: 12px
  standard: 16px
  section: 20px
  panel: 24px
  page: 32px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    typography: '{typography.action}'
    rounded: '{rounded.control}'
    padding: 9px 18px
    height: 40px
  button-primary-hover:
    backgroundColor: '{colors.success}'
    textColor: '{colors.surface}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.body}'
    typography: '{typography.action}'
    rounded: '{rounded.control}'
    padding: 8px 14px
    height: 40px
  input-text:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.field}'
    rounded: '{rounded.surface}'
    padding: 10px 13px
    height: 40px
  input-directory-search:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.field}'
    rounded: '{rounded.surface}'
    padding: 10px 40px 10px 44px
    height: 40px
  navigation-active:
    backgroundColor: '{colors.nav-active}'
    textColor: '{colors.surface}'
    typography: '{typography.action}'
    rounded: '{rounded.control}'
    padding: 10px 12px
    height: 42px
  tab-active:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    typography: '{typography.action}'
    rounded: '{rounded.tab}'
    padding: 8px 16px
    height: 38px
  chip-active:
    backgroundColor: '{colors.success}'
    textColor: '{colors.surface}'
    rounded: '{rounded.badge}'
    padding: 3px 9px
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.body}'
    rounded: '{rounded.surface}'
    padding: 24px
---

# Design System: Avengers Coffee — Web Admin

## Overview

A working enterprise console with clear ink, navy navigation, white cards and a sky accent. This revision follows the user's 2026-10-23 screenshots and explicit request to use shadcn/ui and the Zenith dashboard's record layouts. It supersedes the earlier red System Admin direction. Customer-facing Avengers Coffee branding remains red.

Shared authority covers Web Admin buttons, fields, comboboxes, dialogs, table framing, badges and sidebar colors across roles. System Admin has the full shell/detail redesign; the operational roles consume the same primitives while retaining their business flows and permissions. Do not claim every role has been visually reverified.

Implementation: `tailwind.config.js` emits common palette variables and shadcn color utilities; `src/AdminTheme.css` bridges existing actor styles. Official shadcn/ui source lives in `src/components/ui/` (MIT; provenance in its README). Radix supplies dialog/popover behavior, Recharts supplies chart geometry, and DayPicker supplies calendars. No generated icons or raster assets are introduced.

## Colors

**The Canonical Logo Rule.** Use `avengers-coffee-system/assets/branding/logo.svg`, the original black artwork, on light backgrounds and `logo-white.svg` from the same directory on dark backgrounds. Preserve the artwork and aspect ratio; app SVG copies and native PNGs are synchronized through `scripts/sync-brand.cjs`.

Navy #16354d anchors actions and ink; the sidebar is #102b40 with pale #dce7ef text and left-aligned #a8c1d3 section headings. Active destinations use #164e70. Sky #0284c7 marks focus and chart data. The canvas is #f6f8fa, cards are white, and borders are #e2e8f0.

Badges have a small 5px radius and restrained variants. A confirmed active status can use solid green with white text; inactive states use muted gray; roles and categories generally use outline/secondary. Product attributes and kiosk performance rank remain plain text. Avoid multicolor decorative pills. The latest user brief permits purposeful semantic badges inspired by Zenith.

All status columns use `StatusBadge`, matching the menu status: one library icon, a compact 5px corner, and the existing business label. Active/completed states are green, paused states gray, pending states amber, and failed/rejected states red. Role, category and membership labels remain separate from status.

Save/approve/accept hover turns green; cancel/delete/reject hover turns red. Action meaning and permission do not change with the visual variant. Maintain sufficient text contrast on navigation and badges.

## Typography

Inter remains the established enterprise family, with the system fallbacks in the token layer. This is an intentional dense-workspace choice. Main titles are 26px/600, card titles 15–16px/600, actions 13px/500, and body/data text uses 13–14px with stronger 450–500 weight and #263c50 ink. Labels and captions use #526174; they must remain readable rather than faint.

Identifier stacks (`ui-monospace, SFMono-Regular, Consolas, monospace` and existing SF Mono/Monaco aliases) are reserved for IDs and literal codes. The separate A4 franchise contract print document retains Times New Roman, 14pt; it is not application typography.

## Layout

The System Admin shell retains a 256px desktop sidebar, 72px header and independently scrolling content. The shell owns one primary page title and description. Duplicate list introductions were removed; selected record names update that same heading and breadcrumb through a presentation context. Card titles identify information groups rather than repeat the page title.

Record details use separate cards: summary/actions, identity/operations, contact/location, partner or financial facts. Product details use a 2:1 content/image-and-price composition; order details use three clear information cards and a line-item table. Kiosk and employee facts are independent cards with labels above values and fine row dividers. Collapse to one column at narrow widths.

Desktop tables use fixed widths, wrapping and compact icon actions to keep all information within the desktop canvas. Do not hide meaningful data just to achieve fit. Narrow screens may scroll their own table region. System Admin navigation becomes a drawer below 1101px; mobile controls retain accessible focus and adequate target sizes.

Detail action rows use the same 24px horizontal inset as card content. Branch table actions reserve 132px for three 32px icon buttons and their gaps; keep the group on one line. Dialog headers, body slots and external footers share a 24px gutter (18px on mobile). A footer nested inside a padded body adds no horizontal padding. Prefix icons reserve 44px in inputs through the shared explicit field attribute, overriding legacy control padding.

SMTP separates connection/authentication from test/help, with an explicit right-aligned save footer. The promotion date field uses the shadcn calendar plus a time field and preserves the existing datetime-local payload.

## Elevation & Depth

Use fine borders and white surfaces for the working canvas. Reserve modest offset shadows for floating popovers/dialogs; no blur-backed decorative layers or colored halos. Record cards can have a subtle 0 1px 2px shadow. Do not stack soft floating cards inside every fact field.

## Shapes

Controls use 6px corners, cards 12px, badges 5px. Icon buttons use centered grid/flex geometry with no compensating offsets. Combobox clear and caret controls occupy separate columns. Existing product photos use bounded thumbnails; record image panels preserve the asset's aspect ratio.

## Components

- **Button / Input / Label / Textarea / Card / Table / Badge:** source-owned shadcn primitives shared across Web Admin. Preserve native props, existing event handlers and role permissions. Explicit semantic hover is supplied through data-intent.
- **SearchableSelect / SmartSelect:** a shared searchable field built on shadcn Input, Button and Radix Popover. Preserve option values, disabled/required state, Vietnamese search, keyboard navigation and existing callback shapes. SmartSelect retains its value-only callback.
- **WorkspaceDialog:** shadcn/Radix modal with focus containment/restoration, busy protection, Escape handling and right-aligned footer. Use explicit body/frame/footer slots so nested footers do not add a second gutter. Inner dropdown Escape closes the dropdown first.
- **Chart:** shadcn ChartContainer with Recharts; keep chart geometry, legend and full labels separate. Truncate axis labels only when the tooltip and exact-value table retain the full data. Do not invent growth or revenue statistics.
- **Record details:** shadcn cards and key/value groups; actual loaded values only. Product and order detail actions delegate to existing handlers and permission gates.
- **BranchAddressPicker:** requires city and ward, offers provider addresses and stores the selected point in existing vi_do/kinh_do fields. Its shadcn/Radix Popover shares the system dropdown surface; title/subtitle rows grow with content and scroll within the available viewport. Editing location invalidates the old point. No generated district-centroid fallback. API keys stay on the server.
- **Kiosk approval:** the top “Duyệt hợp đồng” action calls the existing confirmation and approval handler. The temporary document preview/signing viewer is removed at the user's request; retain loaded signed-contract facts.

## Do's and Don'ts

- Keep one page heading in a stable position and meaningful section headings within cards.
- Keep sidebar group headings left aligned and icons visibly contrasted with the navy surface.
- Use semantic badges sparingly; avoid both rainbow tags and an undifferentiated wall of gray text.
- Preserve current state, API contracts and business permissions; the explicitly requested branch location feature is the authorized functional addition.
- Use standard WorkspaceIcons or official component icons, never generated icon art.
- Do not treat old screenshots as current verification. Before browser access was disabled, the navy pass was visually checked at desktop; the later shadcn migration is verified by component tests/builds and still needs a rendered browser pass.

## Franchise operations

The accountant workspace uses OperationalPageFrame: breadcrumb in the header and one large page title above the content. Status summaries are keyboard accessible filter controls. Debts, revenue share and risk reviews use white records with aligned label/value rows; financial results use red for shortages, green for balanced amounts and amber for surplus. Use WorkspaceDialog for confirmations and notes; keep mutation controls busy until completion. Notifications dismiss after three seconds. Kiosk employees access their assigned kiosk order history with refund eligibility checked before confirmation.
