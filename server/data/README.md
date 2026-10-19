# Server data directory

## Purpose

This directory holds **local demonstration data** written by the Node API. It is not part of the static website and must never be served over HTTP.

## `inquiries.json` (runtime, not tracked)

The legacy demonstration `POST /api/inquiries` route stores requests in
`inquiries.json`. The public contact form uses an email draft addressed to
`syphersolutions@gmail.com` and does not call this route or store form data here.

| Topic | Policy |
|---|---|
| Contents | Name, email, optional service/budget, message text, timestamps |
| Delivery | **Saved on disk only.** Email is not sent. |
| Public access | **No.** There is no `GET /api/inquiries` (or other list) route. Path containment keeps this file outside `public/`. |
| Git | **Ignored.** Real visitor data must not be committed. The file is created automatically on first successful inquiry. |
| Retention | Soft cap of **500** newest records (older entries are dropped). Operators should delete or rotate the file when evaluating or shutting down a demo. |
| Privacy | Treat the file as **personal data**. Restrict filesystem access, do not copy it into tickets/logs, and delete it after coursework or demos. |

## `test-results.json`

QA evaluation records used by the optional debug dashboard flow. Prefer simulated entries over real device fingerprints when sharing the repository.

## Operator notes

- Prefer environment isolation (local/dev only) when collecting real inquiries.
- Do not enable directory indexes or reverse-proxy aliases that expose `server/data/`.
- Application logs must not print inquiry bodies (name, email, or message).
