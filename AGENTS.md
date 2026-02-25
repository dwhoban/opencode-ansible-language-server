# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-17
**Type:** Bun Plugin (TypeScript)

## OVERVIEW
OpenCode plugin that bridges Ansible Language Server to AI agents via LSP protocol. Bun-native, no build step.

## STRUCTURE
```
./
├── index.ts              # Plugin entry: 4 tools (completion/diagnostics/hover/definition)
├── lsp-client.ts         # LSP client wrapper: manages ansible-language-server process
├── package.json          # Bun runtime config, deps: @ansible/ansible-language-server
├── tsconfig.json        # TS config: strict mode, noEmit: true
└── *.yml               # Example playbooks (valid/invalid)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add new LSP feature | lsp-client.ts: add method (getCompletions pattern) |
| Expose new tool | index.ts: add tool definition in Plugin return |
| Fix LSP errors | lsp-client.ts: check stderr handler, capability handlers |
| Change server args | index.ts: line 240 (serverArgs) |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| LSPClient | Class | lsp-client.ts | index.ts | Manages ansible-language-server process |
| AnsiblePlugin | Function | index.ts | package.json | Plugin entry point |
| ansible_completion | Tool | index.ts | - | Code completions via LSP |
| ansible_diagnostics | Tool | index.ts | - | Linting/validation via LSP |
| ansible_hover | Tool | index.ts | - | Hover docs via LSP |
| ansible_definition | Tool | index.ts | - | Go-to-definition via LSP |

## CONVENTIONS

### Plugin Interface
- Use `@opencode-ai/plugin` SDK: `tool({ description, args, execute })`
- Args validated with Zod via `tool.schema.string()` / `tool.schema.number()`
- Return string from `execute()`, never throw (catch and return error message)

### LSP Client Pattern
```typescript
// Add capability handlers BEFORE connection.listen()
connection.onRequest("client/registerCapability", () => null);
connection.onRequest("client/unregisterCapability", () => null);
connection.listen();
```

### URI Format
- Always `file://${absolutePath}` for LSP methods
- Example: `file:///Users/dwh/Code/playbook.yml`

### Tool Flow
```
AI Agent → OpenCode → ansible_* tool → LSPClient.method() → ansible-language-server → LSP response → formatted string
```

## ANTI-PATTERNS (THIS PROJECT)
- **Never throw from tool execute()** - wrap in try-catch, return error string
- **Don't suppress LSP init errors** - handle client/registerCapability stub
- **No dist/ folder** - Bun runs TS directly, no build step
- **No src/ directory** - flat structure by design (minimalist plugin)

## UNIQUE STYLES

### Bun-Specific
- `"module": "index.ts"` in package.json (not `"main"`)
- tsconfig `"module": "Preserve"` (Bun bundler handles imports)
- bun.lock (JSON format, not binary)

### Error Handling
All tools return formatted strings, never propagate exceptions:
```typescript
return "Error getting completions: ${error.message}";
```

### Global State
Single LSPClient instance: `let lspClient: LSPClient | null = null;`
Shared across all tool executions (module-level singleton).

## COMMANDS
```bash
bun install                    # Install deps
bun run --type-check index.ts  # Type check
```

## NOTES

### LSP Server Path
Ansible server binary: `node_modules/.bin/ansible-language-server`
Spawned with `--stdio` flag for stdio transport.

### Document Sync
LSP client tracks documents in Map but `openDocument()` not used by tools.
Tools send URI directly; server manages file access.

### Capability Registration
Server calls `client/registerCapability` after init.
Must have stub handler: `connection.onRequest("client/registerCapability", () => null);`

### Recent Fix (2026-01-17)
Added capability stub handlers to prevent ResponseError -32601 on initialization.
