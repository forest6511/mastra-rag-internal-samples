import { listen } from "./mcp/server.js";

// #region main
// npm run mcp
// 手元（127.0.0.1）だけで待ち受ける。外から届くようにするには、
// トンネルか、AWS に置く（第16章）
const port = Number(process.env.MCP_PORT ?? 8787);
listen(port);
console.log(`MCP: http://localhost:${port}/mcp`);
// #endregion
