# Migration before implementation

STARTING_HEAD: 708a2f118ae91a8fa6bfd804e6b122af8ff851ef
Latest DataPlatform commit: 460e8abd01f0c186ab98bee1c304b7f9e2dd288d (ancestor verified).
Unstaged/untracked customer chatbot changes exist and must remain untouched.

The old decision owns requested/supporting operations, subjects, lenses, query IDs,
parent links, breadth, component IDs and component-to-query coverage. Blueprint
materialization first fills lens defaults, then validates explicit metrics against
that lens. Thus item_sales cannot accept product_revenue even though products is
a legal subject. Repair regenerates the entire decision, including mappings;
correcting metrics can invalidate mappings. Provider success says nothing about
this local executable contract rejection.

The new model owns requirements: metrics, dimensions, time, filters, ranking and
derived analytical meaning. The server owns executable topology, compatible
subjects/lenses, query IDs/roles, blueprint selection, coverage and visual budgets.
Lens hints never outrank explicit metrics. Exact catalog/UI anchors verify
omissions independently. Accepted requirements are frozen across targeted
recovery; only invalid requirements are replaced, with accepted scope fields
protected. The existing catalog compiler, AST equality, read-only transaction,
result validators and deterministic dashboard remain mandatory.

Historical V2.4–V2.7 contract tests will retain their old planner explicitly as
migration/reference tests where they assert coupled graph details. New production
tests must invoke the public pipeline using the intent contract. No historical
test deletion is permitted. Changed global budget and UI taxonomy assertions will
be documented separately with their stronger replacement invariants.
