import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { createServer } = await import(require.resolve("vite"));
const React = require("react");
const { renderToString } = require("react-dom/server");

const storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.localStorage = storage;
globalThis.window = {
  location: { hostname: "127.0.0.1" },
  localStorage: storage,
  fetch: globalThis.fetch,
};
const http = (await import("node:http")).createServer();
const react = (await import(require.resolve("@vitejs/plugin-react"))).default;
const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, hmr: { server: http }, watch: null },
  appType: "custom",
});
try {
  const { QueryClient, QueryClientProvider } = await server.ssrLoadModule(
    "@tanstack/react-query",
  );
  for (const [path, name, role] of [
    [
      "actor-admin/components/AdminSystemConsole",
      "AdminSystemConsole",
      "ADMIN",
    ],
    ["franchise/FranchiseePortal", "FranchiseePortal", "FRANCHISEE"],
    [
      "franchise/FranchiseStaffPortal",
      "FranchiseStaffPortal",
      "FRANCHISE_STAFF",
    ],
    [
      "franchise/AccountantFranchiseShell",
      "AccountantFranchiseShell",
      "ACCOUNTANT",
    ],
  ]) {
    const module = await server.ssrLoadModule("/src/features/" + path + ".jsx");
    const client = new QueryClient();
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(module[name], {
          session: {
            user: {
              vai_tro: role,
              ho_ten: "Render fixture",
              kiosk_id: role === "FRANCHISE_STAFF" ? 1 : undefined,
            },
          },
          onLogout: () => {},
          surveysState: { items: [] },
          surveyResponsesState: { items: [] },
        }),
      ),
    );
    if (!html.includes("console-shell"))
      throw new Error(role + " missing shell");
    client.clear();
    console.log(role, "initial shell render passed");
  }
} finally {
  await server.close();
  http.close();
}
