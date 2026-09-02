#!/usr/bin/env node
// A tiny MCP server exposing the local Ollama model as a tool Claude/Codex
// can call mid-task — the actual answer to "can escalated tasks delegate
// work back to local models to save tokens". Registered via --mcp-config
// only for edits/full permission tiers (see claude.js) since it has no
// reason to exist for a read-only Plan-mode call.
//
// This does NOT give the local model any file access — it never has any
// here either. It only ever sees the self-contained text Claude/Codex
// passes it and returns text back; the caller (Claude/Codex) remains the
// one actually reading/writing files with its own tools. The savings are
// in *output tokens*: bulk/boilerplate/repetitive text generation that
// doesn't need Claude's own reasoning can be drafted locally for free, with
// Claude reviewing/inserting the result instead of generating it from
// scratch itself.
//
// Run as a subprocess by the `claude`/`codex` CLI (stdio transport) — never
// invoked directly by this app's own server process.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runLocal, DEFAULT_MODEL } from '../backends/ollama.js';

const server = new McpServer({ name: 'local-model-bridge', version: '1.0.0' });

server.registerTool(
  'ask_local_model',
  {
    title: 'Ask local model',
    description:
      'Delegates a self-contained text-generation sub-task to a free, fast local model running on this machine (Ollama). ' +
      'Use this for bulk, repetitive, or boilerplate work that does not need your own reasoning — e.g. drafting placeholder ' +
      'content for several similar pages, generating a batch of similar small variations, writing routine boilerplate given ' +
      'a clear pattern to follow. Do NOT use it for anything that needs your own judgment, verification, or context beyond ' +
      'what you put in the prompt — it cannot read any files itself, has no memory of this conversation, and its output is ' +
      'not guaranteed correct, so review before using it. You still do all the actual file reading/writing yourself with your ' +
      'own tools; this only drafts text for you to use.',
    inputSchema: {
      prompt: z.string().describe('A fully self-contained prompt — include any context, pattern, or example it needs, since it has no access to this conversation or any files.'),
      model: z.string().optional().describe(`Which installed local model to use. Defaults to "${DEFAULT_MODEL}" if omitted.`)
    }
  },
  async ({ prompt, model }) => {
    try {
      const result = await runLocal(prompt, { model: model || DEFAULT_MODEL });
      return { content: [{ type: 'text', text: result.text }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Local model call failed: ${error.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
