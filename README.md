# OpenCode Ansible Plugin

OpenCode plugin that makes the Ansible Language Server available to AI agents.

## Features

This plugin provides four tools for working with Ansible code:

- **ansible_completion**: Get code completions for Ansible files at a specific position
- **ansible_diagnostics**: Get diagnostics (linting/validation) for an Ansible file
- **ansible_hover**: Get hover information (documentation) for Ansible code at a specific position
- **ansible_definition**: Get the definition location for a symbol in Ansible code

## Installation

```bash
bun install
```

## Usage

The plugin automatically initializes the Ansible Language Server when loaded by OpenCode. The tools are then available for AI agents to use.

### Tool Arguments

#### ansible_completion

- `file`: Absolute path to the Ansible file
- `line`: Line number (0-indexed) for completion
- `character`: Character position (0-indexed) for completion

#### ansible_diagnostics

- `file`: Absolute path to the Ansible file

#### ansible_hover

- `file`: Absolute path to the Ansible file
- `line`: Line number (0-indexed) for hover
- `character`: Character position (0-indexed) for hover

#### ansible_definition

- `file`: Absolute path to the Ansible file
- `line`: Line number (0-indexed) for definition lookup
- `character`: Character position (0-indexed) for definition lookup

## Development

```bash
# Install dependencies
bun install

# Type check
bun run --type-check index.ts lsp-client.ts
```

## Dependencies

- [@ansible/ansible-language-server](https://github.com/ansible/vscode-ansible): The official Ansible Language Server
- [@opencode-ai/plugin](https://github.com/opencode-ai/plugin): OpenCode plugin SDK
- vscode-languageserver-*: LSP protocol libraries

## License

MIT
