<div align="center">
  <h1>Prompt Enhancer</h1>
  <p>Enhance prompts using free LLMs via OpenRouter, with Supabase auth.</p>

  <p>
    <a href="https://react.dev" target="_blank" rel="noreferrer">
      <img alt="React" src="public/react.svg" height="48" />
    </a>
    &nbsp;
    <a href="https://vitejs.dev" target="_blank" rel="noreferrer">
      <img alt="Vite" src="public/vite.svg" height="48" />
    </a>
    &nbsp;
    <a href="https://supabase.com" target="_blank" rel="noreferrer">
      <img alt="Supabase" src="https://raw.githubusercontent.com/supabase/supabase/master/packages/common/assets/images/supabase-logo-wordmark--dark.svg" height="42" />
    </a>
    &nbsp;
    <a href="https://openrouter.ai" target="_blank" rel="noreferrer">
      <img alt="OpenRouter" src="public/openrouter.svg" height="42" />
    </a>
  </p>

  <p>
    <a href="https://nodejs.org/"><img alt="Node >= 18" src="https://img.shields.io/badge/node-%3E%3D18-43853d?logo=node.js&logoColor=white"></a>
    <a href="https://vitejs.dev/"><img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white"></a>
    <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB"></a>
    <a href="https://supabase.com/"><img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white"></a>
    <a href="https://openrouter.ai/"><img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter-0B0B0B"></a>
  </p>
</div>

## Features
- Supabase OAuth (Microsoft/Azure) with persisted sessions and auto-redirect when a session exists
- Model selector (DeepSeek v3.1, GPT-OSS 120B, Qwen3 Coder)
- Streaming completions via a minimal Express bridge to OpenRouter
- Conversation history, copy output, delete conversation
- Optional client-side audit logging to `auth_events`

## Quickstart
1) Install deps
   - `npm i`
2) Configure environment (`.env` in the project root)
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
   - `OPENROUTER_API_KEY=...`
   - `APP_URL=http://localhost:5173`
3) Start the streaming bridge
   - `node server/index.js`
4) Run the web app
   - `npm run dev`

Open http://localhost:5173 and sign in with your Microsoft account. If a local session exists, the app auto-redirects to `/app`.

## OpenRouter models
The UI selects a model; the server forwards it to `https://openrouter.ai/api/v1/chat/completions`.

Default options (configurable in code):
- `deepseek/deepseek-chat-v3.1:free`
- `openai/gpt-oss-120b:free`
- `qwen/qwen3-coder:free`

## Optional: auth audit table
If you’d like to record sign-in/out and session-restore events, see `src/lib/audit.js` for the SQL template.

## Docs
- Settings API: `docs/SETTINGS_API.md`
- MCP Tools Catalog: `docs/MCP_TOOLS.md`
- Supabase schema for settings: `supabase/settings.sql`

## Build
`npm run build` then serve `/dist` behind the same origin as the server (so the app can call `/api/*`).

## Folders
- `src/` — React app (Enhancer UI, model selector)
- `server/` — Minimal Express bridge to OpenRouter (SSE passthrough)
- `public/` — Static assets (includes official React and Vite logos)
- `docs/` — Architecture docs (Settings API, MCP tools)
-, `supabase/` — SQL schema for settings

## Credits
- React and Vite logos from the official Vite template
- Supabase wordmark from Supabase brand assets
- OpenRouter icon included as `public/openrouter.svg`

