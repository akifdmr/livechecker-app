# Safe fix prompt

Follow `AGENTS.md` and the matching S0–S8 scope. Patch only the reported defect.
Use hosted checkout/provider tokens. Do not introduce PAN/CVV input or storage,
raw provider response storage, auth-only card verification, OTP/client-secret
storage, or automatic over-authorization sale fallback.

Report DONE, changed paths, checks run, and any external check not run.
