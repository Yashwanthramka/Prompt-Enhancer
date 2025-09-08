# MCP Tool Catalog (Design)

This catalog defines your app's MCP tools, inputs/outputs, and scopes. The MCP server should enforce user policies from Supabase tables (see `supabase/settings.sql`).

Scopes (suggested)
- `chat:write` — call LLMs / generate content
- `chat:read` — read conversation messages
- `conv:write` — create/update/delete conversations
- `ruleset:read` — list/get rulesets
- `ruleset:write` — save/update rulesets
- `admin:*` — admin‑only operations

---

Tool: `enhance_prompt@1`
- Purpose: Stream enhanced text via OpenRouter using a ruleset
- Params: `{ text: string, model?: string, rulesetId?: string }`
- Returns (stream): tokens; final: `{ usage?: { tokens?: number, model?: string } }`
- Scopes: `chat:write`

Tool: `draft_variations@1`
- Purpose: Generate N alternative rewrites for ideation
- Params: `{ text: string, n?: number (<=5), style?: 'concise'|'casual'|'formal' }`
- Returns: `{ variants: string[] }`
- Scopes: `chat:write`

Tool: `validate_prompt@1`
- Purpose: Lint prompts for clarity/bias/verbosity
- Params: `{ text: string }`
- Returns: `{ issues: { code: string, message: string, start?: number, end?: number }[], suggestions: string[] }`
- Scopes: none (local analysis)

Tool: `create_conversation@1`
- Params: `{ title: string }`
- Returns: `{ id: string }`
- Scopes: `conv:write`

Tool: `add_message@1`
- Params: `{ conversationId: string, role: 'user'|'assistant', content: string, clientMessageId?: string }`
- Returns: `{ id: string }`
- Scopes: `conv:write`

Tool: `list_messages@1`
- Params: `{ conversationId: string, limit?: number, before?: string }`
- Returns: `{ messages: { id: string, role: string, content: string, created_at: string }[] }`
- Scopes: `chat:read`

Tool: `delete_conversation@1`
- Params: `{ conversationId: string }`
- Returns: `{ ok: true }`
- Scopes: `conv:write`

Tool: `list_providers@1`
- Params: none
- Returns: `{ providers: { key: string, label: string }[] }`
- Scopes: none

Tool: `list_rulesets@1`
- Params: none
- Returns: `{ rulesets: { id: string, name: string, version: number }[] }`
- Scopes: `ruleset:read`

Tool: `get_ruleset@1`
- Params: `{ id: string }`
- Returns: `{ id, name, version, content }`
- Scopes: `ruleset:read`

Tool: `save_ruleset@1`
- Params: `{ id?: string, name?: string, content: object, ifMatchVersion?: number }`
- Returns: `{ id: string, version: number }`
- Scopes: `ruleset:write`

Tool: `export_conversation@1`
- Params: `{ conversationId: string, format?: 'json'|'markdown' }`
- Returns: `{ content: string, mime: string }`
- Scopes: `chat:read`

Tool: `log_auth_event@1` (optional)
- Params: `{ event: 'SIGNED_IN'|'SIGNED_OUT'|'TOKEN_REFRESHED'|'SESSION_RESTORED'|'USER_UPDATED', metadata?: object }`
- Returns: `{ ok: true }`
- Scopes: none (no sensitive data stored)

Notes
- Rate limiting: apply per‑tool limits from `mcp_policies`.
- Model access: check `model_policies` and select BYO vs org key. Log usage to `usage_events`.
- Concurrency: `save_ruleset` should enforce `ifMatchVersion` if provided and return 409 on mismatch.

