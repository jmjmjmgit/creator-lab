# Creator Lab notes for Claude Code

Creator Lab is a local Node app (no npm dependencies, no build step) that scrapes a creator's Instagram Reels with Apify, transcribes them with Groq or Fireworks, labels each script (topic, hook, structure and so on), and shows the results in a dashboard at http://127.0.0.1:5190. The owner runs it on a Mac. Read README.md and docs/SETUP.md for the full picture.

The code is dense, one-line-per-function JavaScript. Match that style when editing. `server.mjs` is the HTTP server and reads `.env`. `lib/pipeline.mjs` runs scrape, transcribe and classify with caching. `lib/providers.mjs` has every external API call. `lib/schema.mjs` defines the label categories and parses classifier answers. `public/` is the dashboard. `scripts/doctor.mjs` checks setup without making paid calls.

The owner could not get a TypeSafe Jev account, so this branch (`claude/nice-lovelace-jhnwi3`) adds a second classifier. `CLASSIFIER=llm` sends the same speech-only request to any OpenAI-compatible chat API through `classifyLLM` in `lib/providers.mjs`. The owner uses hcnsec (`LLM_BASE_URL=https://api.hcnsec.cn/v1`), a Chinese relay with prepaid credit that serves DeepSeek, Qwen, GLM and Kimi models. `LLM_MODEL` must be one fixed model name, not "auto", so labels stay comparable across Reels. Save & verify in the Connections dialog lists the model names the key can use. Cached labels are keyed by classifier model, so switching models reclassifies. The speech provider is Groq.

As of the handover, all 27 tests pass (`npm test`, which needs FFmpeg), and the UI was checked in a headless browser with fake keys. No real call to hcnsec has been made yet, because the cloud session could not reach it. The first live 20-Reel pilot is the real test. If hcnsec returns something unexpected, look at `llmAnswers` and `classifyLLM`: they strip code fences, lowercase the choice IDs, retry once on bad labels, and drop `response_format` if the provider returns HTTP 400.

Where the owner got stuck during setup: running npm from the home folder instead of the project folder, a copy of the project under `~/.gemini/antigravity/scratch/creator-lab` that may be an older version, and `.env` files with duplicate `CLASSIFIER` or `TRANSCRIPTION_PROVIDER` lines (the later line wins). The server only reads `.env` at startup, so restart it after every edit. The Connections dialog shows an "Active:" line with the speech provider and classifier the server actually loaded. Check that line first when something asks for Jev.

Never print or commit `.env` or key values. Before claiming a change works, run `npm run check` and `npm test`. These make no paid calls.

Still open: the cost counter shows "Unknown" for the LLM classifier unless `LLM_INPUT_USD_PER_M` and `LLM_OUTPUT_USD_PER_M` are set, and hcnsec bills in yuan. The footer and schema dialog in `public/index.html` still mention Jev as static text.
