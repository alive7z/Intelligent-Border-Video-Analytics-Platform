# IBVAP architecture notes

This directory is reserved for architecture notes, operational runbooks, and design rationale.

The initial design aligns with a modular, scalable deployment model:

- Frontend: React dashboard experience
- Backend: orchestration, auth, RBAC, and event APIs
- AI engine: real-time CV pipeline
- Database: persistent relational records
- Redis: ephemeral runtime state and queues
- Storage: evidence files and media snapshots
- Infra: deployment and observability support

No implementation-specific business logic belongs in this folder yet.
