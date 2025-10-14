import { createApp } from "./app";
import { env } from "./env";

const port = env.port;
const host = env.host;

async function start() {
  const app = await createApp();

  try {
    await app.listen({ port, host });
    app.log.info(`MCP server listening on ${host}:${port}`);
  } catch (error) {
    app.log.error({ err: error }, "Failed to start MCP MAAX COB server");
    process.exit(1);
  }
}

start().catch((error) => {
  console.error("Unexpected error starting server", error);
  process.exit(1);
});
