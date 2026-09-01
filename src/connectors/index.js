// Connector registry — the plugin surface for external service integrations.
// Each connector exposes a `status()` check and a small set of fetch
// functions that return { label, text } context blocks the chat composer
// can attach to an outgoing prompt. To add another (Slack, Linear, ...),
// drop a module here with the same shape and register it below.
import * as github from './github.js';

export const connectors = {
  github: {
    id: 'github',
    name: 'GitHub',
    module: github
  }
};

export async function listConnectorStatus() {
  return Promise.all(
    Object.values(connectors).map(async (c) => ({
      id: c.id,
      name: c.name,
      ...(await c.module.status())
    }))
  );
}
