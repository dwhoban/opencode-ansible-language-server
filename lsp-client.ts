import { spawn, ChildProcess } from "child_process";
import {
  StreamMessageReader,
  StreamMessageWriter,
  createMessageConnection,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  InitializeParams,
  InitializeResult,
  CompletionParams,
  CompletionList,
  HoverParams,
  Hover,
  DefinitionParams,
  Definition,
  Diagnostic,
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
} from "vscode-languageserver-protocol";

export interface LSPClientOptions {
  serverCommand: string;
  serverArgs?: string[];
  workspacePath: string;
}

export class LSPClient {
  private process: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private initialized = false;
  private documents: Map<string, TextDocument> = new Map();
  private options: LSPClientOptions;

  constructor(options: LSPClientOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error("LSP server already running");
    }

    this.process = spawn(this.options.serverCommand, this.options.serverArgs || [], {
      cwd: this.options.workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const reader = new StreamMessageReader(this.process.stdout!);
    const writer = new StreamMessageWriter(this.process.stdin!);

    this.connection = createMessageConnection(reader, writer);

    this.connection.onRequest("client/registerCapability", (params) => {
      console.debug("[LSP] Server attempted to register capabilities:", params);
      return null;
    });

    this.connection.onRequest("client/unregisterCapability", (params) => {
      console.debug("[LSP] Server attempted to unregister capabilities:", params);
      return null;
    });

    this.connection.listen();

    this.process.stderr!.on("data", (data) => {
      console.error(`LSP server stderr: ${data}`);
    });

    this.process.on("error", (error) => {
      console.error(`LSP server error: ${error}`);
    });

    this.process.on("exit", (code) => {
      console.log(`LSP server exited with code ${code}`);
      this.connection?.dispose();
      this.connection = null;
      this.process = null;
      this.initialized = false;
    });
  }

  async initialize(): Promise<InitializeResult> {
    if (!this.connection) {
      throw new Error("LSP server not started");
    }

    const params: InitializeParams = {
      processId: process.pid,
      rootUri: `file://${this.options.workspacePath}`,
      capabilities: {
        textDocument: {
          hover: { dynamicRegistration: false },
          completion: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          diagnostic: { dynamicRegistration: false },
        },
        workspace: {},
      },
    };

    const result = await this.connection.sendRequest<InitializeResult>(
      "initialize",
      params
    );

    if (!this.initialized) {
      await this.connection.sendNotification("initialized", {});
      this.initialized = true;
    }

    return result;
  }

  openDocument(uri: string, languageId: string, content: string): void {
    const textDocument = TextDocument.create(uri, languageId, 1, content);
    this.documents.set(uri, textDocument);

    if (this.connection && this.initialized) {
      this.connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content,
        },
      });
    }
  }

  updateDocument(uri: string, content: string): void {
    const doc = this.documents.get(uri);
    if (!doc) {
      throw new Error(`Document not found: ${uri}`);
    }

    const newVersion = doc.version + 1;
    TextDocument.update(doc, [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: doc.lineCount - 1, character: doc.getText().length },
        },
        text: content,
      },
    ], newVersion);

    this.documents.set(uri, doc);

    if (this.connection && this.initialized) {
      this.connection.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: newVersion },
        contentChanges: [{ text: content }],
      });
    }
  }

  closeDocument(uri: string): void {
    this.documents.delete(uri);

    if (this.connection && this.initialized) {
      this.connection.sendNotification("textDocument/didClose", {
        textDocument: { uri },
      });
    }
  }

  async getCompletions(
    uri: string,
    line: number,
    character: number
  ): Promise<CompletionList | null> {
    if (!this.connection || !this.initialized) {
      throw new Error("LSP server not initialized");
    }

    const params: CompletionParams = {
      textDocument: { uri },
      position: { line, character },
    };

    const result = await this.connection.sendRequest<CompletionList | null>(
      "textDocument/completion",
      params
    );

    return result;
  }

  async getHover(
    uri: string,
    line: number,
    character: number
  ): Promise<Hover | null> {
    if (!this.connection || !this.initialized) {
      throw new Error("LSP server not initialized");
    }

    const params: HoverParams = {
      textDocument: { uri },
      position: { line, character },
    };

    const result = await this.connection.sendRequest<Hover | null>(
      "textDocument/hover",
      params
    );

    return result;
  }

  async getDefinition(
    uri: string,
    line: number,
    character: number
  ): Promise<Definition> {
    if (!this.connection || !this.initialized) {
      throw new Error("LSP server not initialized");
    }

    const params: DefinitionParams = {
      textDocument: { uri },
      position: { line, character },
    };

    const result = await this.connection.sendRequest<Definition>(
      "textDocument/definition",
      params
    );

    return result;
  }

  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    if (!this.connection || !this.initialized) {
      throw new Error("LSP server not initialized");
    }

    const params: DocumentDiagnosticParams = {
      textDocument: { uri },
    };

    const result = await this.connection.sendRequest<DocumentDiagnosticReport>(
      "textDocument/diagnostic",
      params
    );

    if ("items" in result) {
      return result.items;
    }

    return [];
  }

  async shutdown(): Promise<void> {
    if (this.connection && this.initialized) {
      await this.connection.sendRequest("shutdown");
      await this.connection.sendNotification("exit");
    }
  }

  async dispose(): Promise<void> {
    await this.shutdown();

    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.documents.clear();
    this.initialized = false;
  }

  isReady(): boolean {
    return this.connection !== null && this.initialized;
  }
}
