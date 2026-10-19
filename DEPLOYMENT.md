# Deployment

The Vercel project is named `syphersolutions`, with the requested production
address `https://syphersolutions.vercel.app`.

Vercel serves `public/` directly, with no dependency installation or build step.
The Node functions in `api/` preserve device classification and mode configuration
using the same scoring, classification, and configuration as the local server.
No environment variables are required.

The contact form prepares an email draft in the visitor's email application.
It does not store an inquiry or claim that an email was delivered.

The local demonstration endpoints for inquiry storage and QA test-result storage
remain available through `npm start`. They are not deployed to Vercel because
their JSON files require a persistent writable disk. The debug-only save-test
button reports a failure online; normal browsing and performance selection work.

Run `npm test` before publishing. The GitHub production branch should be `main`.
Once the Vercel project is connected to the repository, pushes to `main` deploy
to production and other branches receive preview deployments.
