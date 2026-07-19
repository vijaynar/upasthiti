# @abhyas/module-ai-insights

**Target phase:** Future — product roadmap Phase 2 (post-v1)
**Scope:** monthly AI summaries, review-queue assistance; reserved empty directory (M13)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
