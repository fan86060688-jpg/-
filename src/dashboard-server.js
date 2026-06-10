import { startDashboardServer } from "./dashboard.js";

const port = Number(process.env.PORT ?? 8787);
const { url } = await startDashboardServer({ port });
console.log(`Dashboard: ${url}`);
