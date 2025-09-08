<<<<<<< HEAD
<div align="center">
  <h1>Prompt Enhancer</h1>
  <p>Enhance prompts using free LLMs via OpenRouter — with Supabase auth.</p>

  <!-- Tech logos (official sources or local) -->
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
      <img alt="OpenRouter" src="https://openrouter.ai/android-chrome-192x192.png" height="42" />
    </a>
  </p>

  <!-- Badges -->
  <p>
    <a href="https://nodejs.org/"><img alt="Node >= 18" src="https://img.shields.io/badge/node-%3E%3D18-43853d?logo=node.js&logoColor=white"></a>
    <a href="https://vitejs.dev/"><img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white"></a>
    <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB"></a>
    <a href="https://supabase.com/"><img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white"></a>
    <a href="https://openrouter.ai/"><img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter-0B0B0B"></a>
  </p>
</div>

## Features
- Supabase OAuth (Microsoft/Azure) with persisted sessions and auto-redirect to the app when a session exists
- Model selector (DeepSeek v3.1, GPT-OSS 120B, Qwen3 Coder)
- Streaming completions via a minimal Express bridge to OpenRouter
- Conversation history, copy output, delete conversation
- Client-side audit logging to `auth_events` table (optional)

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
The UI selects a model; the server forwards it directly to `https://openrouter.ai/api/v1/chat/completions`.

Default options (configurable in code):
- `deepseek/deepseek-chat-v3.1:free`
- `openai/gpt-oss-120b:free`
- `qwen/qwen3-coder:free`

## Optional: auth audit table
If you’d like to record sign-in/out and session-restore events, create `auth_events` in Supabase. SQL template is documented in `src/lib/audit.js`.

## Build
`npm run build` then serve `/dist` behind the same origin as the server (so the app can call `/api/*`).

## Folders
- `src/` — React app (Enhancer UI, model selector)
- `server/` — Minimal Express bridge to OpenRouter (SSE passthrough)
- `public/` — Static assets (includes official React and Vite logos)

## Credits
- React and Vite logos from the official Vite template
- Supabase wordmark from the Supabase brand assets repository
- OpenRouter icon from openrouter.ai site assets
=======
# Prompt-Enhancer
A basic Prompt enhancher using free LLMs provided by Openrouter made with React and managed users using supabase
>>>>>>> origin/main
