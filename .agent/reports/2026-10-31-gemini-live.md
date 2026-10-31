# Gemini live qualification — 2026-10-31

The owner authorized testing their existing Gemini connection in a separate
local manual-trigger workflow. Model discovery loaded 46 provider entries.
The first generation request using `gemini-2.5-flash` returned HTTP 404. A
second using `gemini-3.8-flash` timed out at 30 seconds. A third using
`gemini-3.1-flash-lite` completed in 12.137 seconds with finish reason `STOP`
and returned the requested short test text. The workflow was deactivated.

This demonstrates one successful real generation in the local environment,
not reliability across models or production. The cause of the earlier 404 and
timeout is not established. The model picker also includes non-text model names;
listing generateContent support alone does not prove suitability for text output.
