# Settings API (Per-User)

Purpose: back your Settings UI and MCP enforcement. All endpoints expect a valid Supabase JWT in the `Authorization: Bearer <token>` header and rely on RLS for data scoping. Admin endpoints additionally require the user to have `profiles.role = 'admin'` or the request to be made with a service role key.

Base URL: `/api/settings/*` (recommended; adapt to your router)

Auth: Supabase JWT (from `supabase.auth.getSession()`)

Content-Type: `application/json`

---

## Profile

- GET `/api/settings/profile`
  - Returns: `{ user_id, display_name, role, default_model, default_ruleset }`

- PUT `/api/settings/profile`
  - Body: `{ display_name?, default_model?, default_ruleset? }`
  - Returns: updated profile

## API Credentials (BYO keys)

- GET `/api/settings/credentials`
  - Returns array without secrets: `[{ id, provider, name, last4, status, created_at }]`

- POST `/api/settings/credentials`
  - Body: `{ provider: 'openrouter'|'openai'|'anthropic'|'google'|'azure_openai'|'custom', name: string, secret: string }`
  - Behavior: Secret is encrypted server‑side; response never includes `secret`.
  - Returns: `{ id, provider, name, last4, status, created_at }`

- DELETE `/api/settings/credentials/:id`
  - Revokes (soft delete) or hard‑deletes by policy.

## Model Policies

- GET `/api/settings/models`
  - Returns: `[{ model_id, allowed, daily_token_cap, per_min_limit }]`

- PUT `/api/settings/models`
  - Body: array of policies to upsert; missing rows remain unchanged

## MCP Policies

- GET `/api/settings/mcp`
  - Returns: `[{ tool, allowed, scopes, per_min_limit }]`

- PUT `/api/settings/mcp`
  - Body: array of tool policies to upsert

## Rulesets (optional per‑user rules)

- GET `/api/settings/rulesets`
  - Returns: `[ { id, name, version, is_default, updated_at } ]`

- GET `/api/settings/rulesets/:id`
  - Returns: `{ id, name, version, content, is_default }`

- POST `/api/settings/rulesets`
  - Body: `{ name, content }`

- PUT `/api/settings/rulesets/:id`
  - Body: `{ content, ifMatchVersion? }` (optimistic concurrency)

- POST `/api/settings/rulesets/:id/default`
  - Marks as default for the user

## Usage & Audit

- GET `/api/settings/usage?since=ISO&until=ISO`
  - Returns summary and events for charts

- GET `/api/settings/audit?limit=100`
  - Returns last N settings changes

## Admin (optional)

- GET `/api/admin/users`
- GET `/api/admin/users/:user_id/usage`
- POST `/api/admin/users/:user_id/disable`
- POST `/api/admin/users/:user_id/export`

Notes
- All endpoints are thin wrappers over Supabase tables defined in `../supabase/settings.sql`.
- Service role key may be used for admin endpoints in a trusted environment.

