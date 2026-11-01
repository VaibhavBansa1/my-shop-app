# AI assistant (optional)

"Summarise my shop" turns the books into a short plain-language summary in **English, Hindi or
Hinglish**, and can answer a question such as *"Which customers should I call for payment?"*.
It works with a **local model on your own computer** (Ollama, LM Studio) or a **cloud service**
(Groq, OpenRouter, xAI Grok, OpenAI, any OpenAI-compatible server).

It is **off** until both are true:
1. the server has `AI_PROVIDER` (and friends) set in `.env.local`, and
2. an owner/admin turns it on for the business in **Settings → AI assistant**.

## Set up Ollama (local, private, free)
1. Install Ollama from https://ollama.com and pull a model:
```bash
ollama pull llama3.2
```
   Good small choices: `llama3.2` (3B, fast on CPU), `qwen2.5:7b` (better Hindi), `gemma3:4b`.
2. In `.env.local`:
```
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```
3. Restart the app (`npm run dev`). Settings → AI assistant → turn on. Home → ✨ Shop summary.

Ollama on a different PC on your Wi-Fi: start it with `OLLAMA_HOST=0.0.0.0 ollama serve` and set
`AI_BASE_URL=http://192.168.x.x:11434/v1`.

## LM Studio (local)
Developer tab → load a model → **Start Server**. Copy the model id shown there.
```
AI_PROVIDER=lmstudio
AI_MODEL=<model id from LM Studio>
```

## Groq (cloud, very fast)
Create a key at https://console.groq.com and pick a model id from its Models page.
```
AI_PROVIDER=groq
AI_API_KEY=gsk_...
AI_MODEL=<model id>
```

## OpenRouter / xAI Grok / OpenAI / other
```
AI_PROVIDER=openrouter     # or xai, openai, custom
AI_API_KEY=...
AI_MODEL=...
# AI_BASE_URL=...          # required for custom
```

## What is sent to the model
Computed figures only: sales, purchases, expenses by ledger, gross and net profit, opening/closing stock,
cash & bank, top 5 items, low-stock items, the 5 largest receivables and payables, GST totals.
**Never sent:** narrations, addresses, phone numbers, GSTINs, passwords, individual vouchers.

Names (customers, suppliers, items, business):
- local model → sent (it never leaves your network);
- cloud provider → replaced with "Customer A", "Item B"… unless you set `AI_SHARE_NAMES=always`.
- `AI_SHARE_NAMES=never` hides names even from local models.

## Safety
- The model only writes text; it cannot change the books. Output is shown as plain text.
- The model is told to use only the given numbers, and that data inside the facts is not instructions.
- Each summary is written to the activity log (provider, model, period — not the content).
- Limits: 30 requests per user per hour; timeout `AI_TIMEOUT_MS` (default 2 minutes).
- The server address of the AI comes only from server settings, never from users.

## Troubleshooting
| Message | Fix |
|---|---|
| "Could not reach the AI server … Is Ollama running?" | Start Ollama/LM Studio; check `AI_BASE_URL`. |
| "model … was not found" | `ollama pull <model>` or fix `AI_MODEL`. |
| "took too long" | Use a smaller model or raise `AI_TIMEOUT_MS`. |
| "rejected the API key" | Check `AI_API_KEY`. |
