# Mock MCP Servers

These TypeScript services provide simulated AIOps data. They use the official
Model Context Protocol SDK and require only the project's Node.js dependencies.

Run each service in a separate terminal from `onecall-ts`:

```powershell
pnpm mcp:cls
pnpm mcp:monitor
```

- CLS MCP: `http://127.0.0.1:8003/mcp`
- Monitor MCP: `http://127.0.0.1:8004/mcp`

Both services bind to the loopback interface only. The main application
continues without MCP tools if either service is unavailable.
