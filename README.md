# OpenCode Ansible Plugin

[![npm version](https://img.shields.io/npm/v/@opencode-ai/ansible-plugin)](https://www.npmjs.com/package/@opencode-ai/ansible-plugin)
[![CI](https://github.com/dwhoban/opencode-ansible-language-server/actions/workflows/ci.yml/badge.svg)](https://github.com/dwhoban/opencode-ansible-language-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OpenCode plugin that makes the Ansible Language Server available to AI agents.

## Features

This plugin provides four tools for working with Ansible code:

- **ansible_completion**: Get code completions for Ansible files at a specific position
- **ansible_diagnostics**: Get diagnostics (linting/validation) for an Ansible file
- **ansible_hover**: Get hover information (documentation) for Ansible code at a specific position
- **ansible_definition**: Get the definition location for a symbol in Ansible code

## Installation

```bash
bun add @opencode-ai/ansible-plugin
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

## Publishing

Releases are automated via GitHub Actions. To publish a new version:

1. Update the `version` field in `package.json`
2. Commit and push to `main`
3. Create and push a matching git tag: `git tag v<version> && git push origin v<version>`

The release workflow will type-check, verify the version, do a dry-run, publish to npm with provenance, and create a GitHub Release automatically.

> **Note:** Requires the `NPM_TOKEN` secret and a `npm-publish` GitHub environment configured in the repository settings.

## Dependencies

- [@ansible/ansible-language-server](https://github.com/ansible/vscode-ansible): The official Ansible Language Server
- [@opencode-ai/plugin](https://github.com/opencode-ai/plugin): OpenCode plugin SDK
- vscode-languageserver-*: LSP protocol libraries

## License

MIT
