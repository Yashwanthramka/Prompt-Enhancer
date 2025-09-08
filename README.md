<<<<<<< HEAD
# Prompt-Enhancer

React + Vite app for enhancing prompts using free LLMs via OpenRouter, with Supabase authentication and simple conversation history.

## Features
- Supabase OAuth (Microsoft/Azure) with persisted sessions
- Model selector (DeepSeek v3.1, GPT-OSS 120B, Qwen3 Coder)
- Streaming completions bridged through a minimal Express server
- Conversation history, copy output, delete conversation
- Client-side audit logging to `auth_events` table (optional)

## Getting started
1) Install deps:
   - `npm i`
2) Create `.env` in project root with:
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
   - `OPENROUTER_API_KEY=...`
   - `APP_URL=http://localhost:5173`
3) Run the backend bridge:
   - `node server/index.js`
4) In another terminal, run the web app:
   - `npm run dev`

## OpenRouter models
Server exposes `/api/providers` and forwards the chosen `model` to `https://openrouter.ai/api/v1/chat/completions`.

## Optional: audit table
Create table `auth_events` (SQL in comments in `src/lib/audit.js`) to log sign-in/out and session restore events.

## Build
`npm run build` then serve `/dist` behind the same origin as the server.
=======
# Prompt-Enhancer
A basic Prompt enhancher using free LLMs provided by Openrouter made with React and managed users using supabase
>>>>>>> origin/main
