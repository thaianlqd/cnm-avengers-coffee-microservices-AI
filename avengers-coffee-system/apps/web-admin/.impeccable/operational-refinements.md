# Operational refinements — source record

Recorded 2026-10-24. This surface brief extends the existing Web Admin direction; `DESIGN.md`, `design.json` and the established navy identity retain authority. It records implemented behavior rather than a new visual system.

- **Application frame:** the console is constrained to the dynamic viewport height. Content scrolls inside the workspace; browser scroll chaining and rubber-band are suppressed. Keep long content reachable inside its intended scroll region.
- **Flash sale editor:** distinguish the expanded editing surface from the campaign summary. Keep close and product removal actions visibly red, with each product removal control at the row's far edge. The price list adapts to its available container width, including the space consumed by sidebar and card padding.
- **Franchise kiosk scope:** place one shared kiosk context control in the operational header across franchisee features. The selected kiosk scopes operational pages and staff management; the account wallet stays account-wide. A single assigned kiosk is read-only context. Keep the POS kiosk cards as the entry to selling and omit their redundant visible heading beneath the shell title.
- **Menu availability:** pair the shared status badge (“Đang bán” / “Tạm ngưng”) with the shared switch. Availability is saved per kiosk through the inventory selling endpoint. A globally paused product remains unavailable. Loading or failed availability reads prevent POS selection; show the existing loading/error feedback and retry action.
- **Persistence boundary:** the selling update changes only `dang_kinh_doanh` for the product and branch. Preserve concurrent stock quantities and the existing inventory schema. Do not represent a successful save before the server responds.
- **User-facing language:** use “Chia sẻ doanh thu” for royalty labels in the admin, accountant, kiosk partner and customer franchise surfaces. Existing internal field names, enum values and URLs remain the integration contract.

Evidence: `src/AdminTheme.css`, `src/features/franchise/KioskWorkspaceComponents.jsx`, `FranchiseePortal.jsx`, `FranchiseStaffPortal.jsx`, `useKioskAvailability.js`; `services/inventory-service/src/modules/inventory/inventory.service.ts`; franchise label sources in Web Admin and `apps/web-customer/src/pages/FranchisePage.jsx`.

Verification limit: this record comes from source inspection. Browser access is disabled for this pass; there is no current rendered verification or visual signoff. Component/backend test results belong to the accompanying implementation verification, not this documentation audit.
