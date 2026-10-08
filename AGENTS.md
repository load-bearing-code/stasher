<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Committing

- Never commit changes without asking first. Always get explicit confirmation before running `git commit`.
- Always co-sign commits with a `Co-Authored-By` trailer naming the provider and model you are:

  ```
  Co-Authored-By: PROVIDER (MODEL ID) <noreply@anthropic.com>
  ```

  Examples:

  ```
  Co-Authored-By: Claude (Sonnet 5) <noreply@anthropic.com>
  Co-Authored-By: Claude (Opus 4.8) <noreply@anthropic.com>
  Co-Authored-By: Claude (Fable 5.1) <noreply@anthropic.com>
  Co-Authored-By: Kimi (K3) <noreply@anthropic.com>
  Co-Authored-By: OpenAI (Sol 5.6) <noreply@anthropic.com>
  ```
