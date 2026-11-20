"""APMS Business Domain Modules.

Architecture Rule: One module, one folder, four files:
- router.py: FastAPI routes — calls service, returns HTTP response
- service.py: Business logic only — no HTTP, no raw SQL
- repository.py: All DB queries for this module only
- schemas.py: Pydantic request/response models
"""
