# joshfisidi.com

A static portal based on the supplied Viewport Wormhole design. No framework, runtime dependencies, external fonts, or build bundler. The menu works without JavaScript; the deferred WebGL2 background has a CSS fallback and respects reduced motion.

Build: `node tools/build.mjs`

Deploy: `npx wrangler deploy` (authenticated Cloudflare account required).

Cloudflare Worker: `joshfisidi-portfolio`. Custom domains: `joshfisidi.com` and `www.joshfisidi.com`. `wrangler.jsonc` is the deployment configuration. Only `dist/` is uploaded. GitHub Pages is separate and does not control these domains.

The older assets remain in the repository for history but are excluded from deployment. Deployment is explicit through Wrangler; pushing a branch alone does not deploy.
