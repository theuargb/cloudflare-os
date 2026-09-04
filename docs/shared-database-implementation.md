# Shared database implementation

This checklist tracks the implementation of the approved shared D1 database and AI architect plan.
Deployment and live acceptance testing are intentionally left to the operator.

- [x] Publish the structured `SharedDatabase` singleton RPC contract.
- [x] Establish a schema-scoped structured SQL compiler with identifier and request limits.
- [x] Add signed opaque keyset cursors and complete scalar/schema validation.
- [x] Implement the installation D1 platform schema and auto-provisioned Database account.
- [x] Implement the ambient `SharedDatabase` session, value-free auditing, and request-time consumer registration.
- [x] Implement the database architect, constrained migration IR, and deterministic migrations.
- [x] Keep schema activation in the admin-only app, including stale checks, blockers, two-step force, safe revert, and retained cleanup.
- [x] Add the responsive Database overview, Schema Architect discussions, review controls, and settings UI.
- [x] Keep gadgets unbound by default and rely on the existing `setGadgetBinding` mechanism.
- [x] Register and preinstall the `SharedDatabase` singleton; expose no selectable Database resources.
- [x] Add shared, serialized architect threads and separate idempotent reference-data seed drafts.
- [x] Add bounded public-only Context retrieval through a direct Database-to-Context binding.
- [x] Reuse each administrator's existing Workshop model through a credential-free app capability.
- [x] Upgrade the release manifest and deploy tooling for D1 and ordered migrations.
- [ ] Perform live browser, model-provider, D1 migration, and multi-gadget acceptance after deployment.
- [ ] Run `pnpm lint`, `pnpm build`, and `pnpm test` before handoff.
