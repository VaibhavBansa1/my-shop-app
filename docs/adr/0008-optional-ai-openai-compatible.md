# ADR-0008: Optional AI summaries through one OpenAI-compatible client

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
The owner wants a plain-language "summarise my shop" for family members, using a local LLM (Ollama /
LM Studio on his PC) or cloud services (Groq, OpenRouter, Grok). Accounting data is private.

## Decision
- One small client calling `POST {baseUrl}/chat/completions` (the de-facto standard spoken by Ollama,
  LM Studio, Groq, OpenRouter, xAI, OpenAI). Presets fill in base URLs. No SDK dependencies.
- Configuration only through server environment variables; no per-user URLs (prevents SSRF).
- Off by default twice: server must be configured, and each business opts in.
- The server computes all figures; the model only phrases them. Facts are wrapped and labelled as data.
- Privacy: names are sent only to local models by default; narrations/contacts never.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| **OpenAI-compatible client (chosen)** | Works with every requested provider; tiny; testable with a fake server | Provider-specific features unused |
| Vendor SDKs per provider | Full features | Many dependencies, more code |
| LLM with tool access to the database | Can answer anything | Risky (prompt injection could read other data); hard to make tenant-safe |

## Consequences
- Easy to switch providers by editing `.env.local`.
- Answers can still be wrong; UI says so and points to Reports.
- Revisit: streaming responses; scheduled weekly summary by email/WhatsApp; Anthropic native API.
