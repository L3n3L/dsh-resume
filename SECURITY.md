# Security and permission boundary

`dsh-resume` is a local-first resume workbench. It intentionally has bounded file and local HTTP capabilities; it is not a read-only UI theme.

## Runtime capabilities

- Reads and writes only the user-selected resume workspace (`jobhunt/`) and plugin-owned state used for preview, versions, templates, and presentation settings.
- Uses local HTTP routes for the DSH web UI and an explicitly user-started Streamable HTTP MCP endpoint. Runtime code does not upload resume content to third-party services.
- Does not spawn shells, child processes, or system commands at runtime. Node test workers are test-only and are not install lifecycle hooks.
- Reads path-related environment variables such as `DSH_HOME`, `LOCALAPPDATA`, `APPDATA`, and `HOME` to locate plugin-owned state. It does not read or forward API keys, OAuth tokens, cookies, or passwords.

## Dependencies and lifecycle

Runtime dependencies are `@modelcontextprotocol/server`, `markdown-it`, and `zod`. DSH packages are declared as peer dependencies and are supplied by the host. The package has no `preinstall`, `install`, `postinstall`, or `prepare` script.

The optional icon-catalog generator is intentionally not part of the published runtime surface. It previously contained a CDN fetch and developer-specific absolute paths; the checked-in icon catalog is the runtime artifact.

## Failure boundaries

Workspace paths are normalized and kept under the selected root. Writes use workspace locking and atomic replacement where applicable. Invalid paths, stale external state, unknown icon tokens, a stopped MCP endpoint, or failed rendering return an error and do not silently switch workspaces or submit/export a resume.

## Store review expectation

Because file and local-network capabilities are real product behavior, an automated low-risk approval would be misleading. DSH STORE should treat the fixed Commit as requiring separate dependency, permission, and disposable-Profile review (`user-reviewed` when the catalog contract permits it). Static checks do not prove installation, startup, uninstall, rollback, or visual/runtime acceptance.
