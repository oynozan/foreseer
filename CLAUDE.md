# Foreseer coding rules

These six rules apply to every file, every session, no exceptions.

1. No em dashes. Not in code, comments, docs, READMEs, or commit messages.
2. Comments: max one line, max 10 words. Use them sparingly, section by section.
   Never narrate line by line. Consensus functions carry exactly one comment in
   the form `// FORESEER-SPEC §3` and nothing longer.
3. Test every step before starting the next. Every task ends with end tests plus
   a smoke test, even the smallest task.
4. If anything is missing or ambiguous (a value, a design choice, a dependency,
   a naming question): STOP and ask the developer. Never mock a missing piece.
   Never pretend. Never improvise a decision.
5. Git: commit only. Never push. Never add remotes. Never publish. Conventional
   commit messages (`feat:`, `test:`, `docs:`). No Co-Authored-By trailers.
   No "Generated with" footers. No emoji. Attribution is disabled at the tool
   level via `.claude/settings.json`.
6. Maintain correct .gitignore files. Never commit node_modules, dist, coverage,
   .env, `.claude/settings.local.json`, or editor junk. `spec/vectors/` and
   `packages/ts/test/vectors/` MUST be committed (they are deliverables, not
   build output).

## Repo structure notes

- The root is a monorepo. `packages/ts` is an independent git repository
  registered as a submodule. Commit discipline is always two steps: commit
  inside `packages/ts` first, then commit the submodule pointer bump in the
  root. A root commit must never contain a dirty submodule.
- Never stage `packages/ts` file contents into the root repo.
- `spec/SPEC.md` is the source of truth. If code and spec drift, fix the code.
- Consensus-critical code uses integer and byte operations only. No floats,
  no `Math.random`, no `Date.now`, no locale-dependent behavior.
