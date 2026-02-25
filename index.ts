import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { LSPClient } from "./lsp-client";
import * as path from "path";
import * as fs from "fs";

// Module-level state for lazy initialization and connection pooling
let lspClient: LSPClient | null = null;
let lspInitPromise: Promise<void> | null = null;
let pluginConfig: { workspacePath: string; serverPath: string } | null = null;
let isAnsibleProject = false;

/**
 * Detect if the current project contains Ansible content.
 * Checks for:
 * - ansible.cfg or .ansible.cfg configuration files
 * - Standard Ansible directory structures (roles/, inventory/, group_vars/, host_vars/)
 * - YAML files with Ansible patterns (playbooks with hosts: and tasks:)
 */
async function detectAnsibleProject(workspacePath: string): Promise<boolean> {
  // Check for Ansible config files (fast check)
  const configFiles = ["ansible.cfg", ".ansible.cfg"];
  for (const configFile of configFiles) {
    const configPath = path.join(workspacePath, configFile);
    if (fs.existsSync(configPath)) {
      console.log(`[Ansible Plugin] Found ${configFile} - Ansible project detected`);
      return true;
    }
  }

  // Check for standard Ansible directories
  const ansibleDirs = ["roles", "inventory", "group_vars", "host_vars", "playbooks"];
  for (const dir of ansibleDirs) {
    const dirPath = path.join(workspacePath, dir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      console.log(`[Ansible Plugin] Found ${dir}/ directory - Ansible project detected`);
      return true;
    }
  }

  // Check for common playbook file patterns
  const playbookPatterns = [
    "playbook.yml",
    "playbook.yaml",
    "site.yml",
    "site.yaml",
    "main.yml",
    "main.yaml",
  ];
  for (const pattern of playbookPatterns) {
    const filePath = path.join(workspacePath, pattern);
    if (fs.existsSync(filePath)) {
      // Verify it looks like an Ansible playbook
      if (await isAnsiblePlaybook(filePath)) {
        console.log(`[Ansible Plugin] Found playbook ${pattern} - Ansible project detected`);
        return true;
      }
    }
  }

  // Scan for YAML files in the root that might be playbooks
  try {
    const files = fs.readdirSync(workspacePath);
    const yamlFiles = files.filter(
      (f) =>
        (f.endsWith(".yml") || f.endsWith(".yaml")) &&
        !f.startsWith(".") &&
        fs.statSync(path.join(workspacePath, f)).isFile()
    );

    // Check up to 5 YAML files for Ansible patterns
    for (const yamlFile of yamlFiles.slice(0, 5)) {
      const filePath = path.join(workspacePath, yamlFile);
      if (await isAnsiblePlaybook(filePath)) {
        console.log(`[Ansible Plugin] Found Ansible content in ${yamlFile} - Ansible project detected`);
        return true;
      }
    }
  } catch (error) {
    // Ignore directory read errors
  }

  console.log("[Ansible Plugin] No Ansible content detected - plugin disabled");
  return false;
}

/**
 * Check if a YAML file appears to be an Ansible playbook or task file.
 * Looks for patterns like:
 * - hosts: and tasks: (playbook)
 * - ansible.builtin. module references
 * - become:, vars:, handlers: keywords
 */
async function isAnsiblePlaybook(filePath: string): Promise<boolean> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.slice(0, 2000); // Only check first 2KB

    // Strong indicators of Ansible content
    const strongPatterns = [
      /^\s*-?\s*hosts:/m, // Playbook with hosts
      /^\s*-?\s*tasks:/m, // Playbook with tasks
      /ansible\.builtin\./m, // Ansible builtin modules
      /ansible\.posix\./m, // Ansible posix collection
      /community\.general\./m, // Community general collection
    ];

    for (const pattern of strongPatterns) {
      if (pattern.test(lines)) {
        return true;
      }
    }

    // Moderate indicators (need at least 2)
    const moderatePatterns = [
      /^\s*become:/m,
      /^\s*vars:/m,
      /^\s*handlers:/m,
      /^\s*roles:/m,
      /^\s*pre_tasks:/m,
      /^\s*post_tasks:/m,
      /^\s*gather_facts:/m,
      /^\s*-\s*name:/m, // Task with name
      /^\s*register:/m,
      /^\s*when:/m,
      /^\s*loop:/m,
      /^\s*with_items:/m,
      /^\s*notify:/m,
    ];

    let moderateCount = 0;
    for (const pattern of moderatePatterns) {
      if (pattern.test(lines)) {
        moderateCount++;
        if (moderateCount >= 2) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Lazily initialize the LSP client on first tool use.
 * This avoids spawning the Ansible Language Server until actually needed.
 */
async function ensureLspClient(): Promise<LSPClient> {
  if (lspClient && lspClient.isReady()) {
    return lspClient;
  }

  if (lspInitPromise) {
    await lspInitPromise;
    if (lspClient && lspClient.isReady()) {
      return lspClient;
    }
    throw new Error("LSP initialization failed");
  }

  if (!pluginConfig) {
    throw new Error("Ansible plugin not configured - no Ansible project detected");
  }

  if (!isAnsibleProject) {
    throw new Error("Ansible Language Server not available - no Ansible project detected in workspace");
  }

  lspInitPromise = initializeLspClient();
  await lspInitPromise;

  if (!lspClient || !lspClient.isReady()) {
    throw new Error("Failed to initialize Ansible Language Server");
  }

  return lspClient;
}

/**
 * Initialize the LSP client connection.
 */
async function initializeLspClient(): Promise<void> {
  if (!pluginConfig) {
    throw new Error("Plugin not configured");
  }

  const { serverPath, workspacePath } = pluginConfig;

  lspClient = new LSPClient({
    serverCommand: serverPath,
    serverArgs: ["--stdio"],
    workspacePath,
  });

  try {
    await lspClient.start();
    const capabilities = await lspClient.initialize();

    console.log("[Ansible Plugin] Language Server initialized with capabilities:", {
      completionProvider: !!capabilities.capabilities.completionProvider,
      hoverProvider: !!capabilities.capabilities.hoverProvider,
      definitionProvider: !!capabilities.capabilities.definitionProvider,
      diagnosticProvider: !!capabilities.capabilities.diagnosticProvider,
    });
  } catch (error) {
    console.error("[Ansible Plugin] Failed to initialize Language Server:", error);
    lspClient = null;
    throw error;
  }
}

const AnsiblePlugin: Plugin = async (input) => {
  const { directory, worktree } = input;

  return {
    tool: {
      ansible_completion: tool({
        description:
          "Get code completions for Ansible files at a specific position",
        args: {
          file: tool.schema
            .string()
            .describe("Absolute path to the Ansible file"),
          line: tool.schema
            .number()
            .describe("Line number (0-indexed) for completion"),
          character: tool.schema
            .number()
            .describe("Character position (0-indexed) for completion"),
        },
        async execute(args, context) {
          try {
            const client = await ensureLspClient();

            const uri = `file://${args.file}`;
            const completions = await client.getCompletions(
              uri,
              args.line,
              args.character,
            );

            if (!completions || completions.items.length === 0) {
              return "No completions available at this position";
            }

            const result = completions.items
              .map((item) => {
                const label = item.label;
                const kind =
                  item.kind !== undefined
                    ? getCompletionItemKindString(item.kind)
                    : "";
                const detail = item.detail || "";
                let docs = "";
                if (item.documentation) {
                  if (typeof item.documentation === "string") {
                    docs = item.documentation;
                  } else if ("value" in item.documentation) {
                    docs = item.documentation.value as string;
                  }
                }
                return `${label}${kind ? ` (${kind})` : ""}${detail ? ` - ${detail}` : ""}${docs ? `\n  ${docs}` : ""}`;
              })
              .join("\n\n");

            return result || "No completions available at this position";
          } catch (error) {
            return `Error getting completions: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),

      ansible_diagnostics: tool({
        description: "Get diagnostics (linting/validation) for an Ansible file",
        args: {
          file: tool.schema
            .string()
            .describe("Absolute path to the Ansible file"),
        },
        async execute(args, context) {
          try {
            const client = await ensureLspClient();

            const uri = `file://${args.file}`;
            const diagnostics = await client.getDiagnostics(uri);

            if (diagnostics.length === 0) {
              return "No diagnostics found";
            }

            const result = diagnostics
              .map((diag) => {
                const range = diag.range;
                const severity = getSeverityString(diag.severity);
                const message = diag.message;
                const source = diag.source || "ansible";
                const code = diag.code ? ` (${String(diag.code)})` : "";
                const relatedInfo = diag.relatedInformation
                  ? "\n  " +
                    diag.relatedInformation
                      .map(
                        (info) =>
                          `Related: ${info.message} at ${info.location.uri}:${info.location.range.start.line}`,
                      )
                      .join("\n  ")
                  : "";

                return `${severity}${code} [${source}] Line ${range.start.line + 1}:${range.start.character + 1}: ${message}${relatedInfo}`;
              })
              .join("\n\n");

            return result;
          } catch (error) {
            return `Error getting diagnostics: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),

      ansible_hover: tool({
        description:
          "Get hover information (documentation) for Ansible code at a specific position",
        args: {
          file: tool.schema
            .string()
            .describe("Absolute path to the Ansible file"),
          line: tool.schema
            .number()
            .describe("Line number (0-indexed) for hover"),
          character: tool.schema
            .number()
            .describe("Character position (0-indexed) for hover"),
        },
        async execute(args, context) {
          try {
            const client = await ensureLspClient();

            const uri = `file://${args.file}`;
            const hover = await client.getHover(
              uri,
              args.line,
              args.character,
            );

            if (!hover || !hover.contents) {
              return "No documentation available at this position";
            }

            let result = "";
            if (typeof hover.contents === "string") {
              result = hover.contents;
            } else if (Array.isArray(hover.contents)) {
              result = hover.contents
                .map((item) => (typeof item === "string" ? item : item.value))
                .join("\n");
            } else if ("value" in hover.contents) {
              result = hover.contents.value;
            }

            return result || "No documentation available at this position";
          } catch (error) {
            return `Error getting hover information: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),

      ansible_definition: tool({
        description: "Get the definition location for a symbol in Ansible code",
        args: {
          file: tool.schema
            .string()
            .describe("Absolute path to the Ansible file"),
          line: tool.schema
            .number()
            .describe("Line number (0-indexed) for definition lookup"),
          character: tool.schema
            .number()
            .describe("Character position (0-indexed) for definition lookup"),
        },
        async execute(args, context) {
          try {
            const client = await ensureLspClient();

            const uri = `file://${args.file}`;
            const definitions = await client.getDefinition(
              uri,
              args.line,
              args.character,
            );

            if (
              !definitions ||
              (Array.isArray(definitions) && definitions.length === 0)
            ) {
              return "No definition found at this position";
            }

            if (!Array.isArray(definitions)) {
              const def = definitions;
              return `Definition found at ${def.uri} line ${def.range.start.line + 1}:${def.range.start.character + 1}`;
            }

            const result = definitions
              .map(
                (def) =>
                  `${def.uri} line ${def.range.start.line + 1}:${def.range.start.character + 1}`,
              )
              .join("\n");

            return result;
          } catch (error) {
            return `Error getting definition: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
    },

    async config(config) {
      const pluginDir = path.dirname(new URL(import.meta.url).pathname);
      const ansibleServerPath = path.join(
        pluginDir,
        "node_modules",
        ".bin",
        "ansible-language-server",
      );

      if (!fs.existsSync(ansibleServerPath)) {
        console.error(
          `[Ansible Plugin] Language Server not found at ${ansibleServerPath}`,
        );
        return;
      }

      isAnsibleProject = await detectAnsibleProject(worktree);
      
      if (!isAnsibleProject) {
        return;
      }

      pluginConfig = {
        serverPath: ansibleServerPath,
        workspacePath: worktree,
      };

      console.log("[Ansible Plugin] Configured for lazy initialization - LSP will start on first tool use");
    },
  };
};

function getCompletionItemKindString(kind: number): string {
  const kinds: Record<number, string> = {
    1: "Text",
    2: "Method",
    3: "Function",
    4: "Constructor",
    5: "Field",
    6: "Variable",
    7: "Class",
    8: "Interface",
    9: "Module",
    10: "Property",
    11: "Unit",
    12: "Value",
    13: "Enum",
    14: "Keyword",
    15: "Snippet",
    16: "Color",
    17: "File",
    18: "Reference",
    19: "Folder",
    20: "EnumMember",
    21: "Constant",
    22: "Struct",
    23: "Event",
    24: "Operator",
    25: "TypeParameter",
  };
  return kinds[kind] || "Unknown";
}

function getSeverityString(severity: number | undefined): string {
  if (severity === undefined) return "Info";
  const severities: Record<number, string> = {
    1: "Error",
    2: "Warning",
    3: "Info",
    4: "Hint",
  };
  return severities[severity] || "Unknown";
}

export default AnsiblePlugin;
