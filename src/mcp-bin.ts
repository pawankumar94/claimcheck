/**
 * Dedicated entry point for MCP hosts.
 *
 * The main bin is a CLI whose default command is `status`, so a host that runs
 * the package with no arguments -- the convention for npm-published MCP servers
 * -- would get a ticket listing on stdout and never speak the protocol. This
 * starts the server and nothing else.
 */
import { startMcpServer } from "./mcp-server.js";

startMcpServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
