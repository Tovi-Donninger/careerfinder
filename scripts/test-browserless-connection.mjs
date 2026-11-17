import { chromium } from "playwright-core";

const token = process.env.BROWSERLESS_TOKEN;
if (!token) throw new Error("BROWSERLESS_TOKEN is missing");
const endpoint = process.env.BROWSERLESS_WS_ENDPOINT || "wss://production-ams.browserless.io";
const ws = new URL(endpoint);
if (ws.protocol !== "wss:" || ws.username || ws.password || ws.search || ws.hash)
  throw new Error("Expected a clean secure Browserless WebSocket endpoint");
ws.searchParams.set("token", token);
let browser;
try {
  browser = await chromium.connectOverCDP(ws.toString(), { timeout: 20000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
  if (!(await page.title()).includes("Example Domain"))
    throw new Error("Unexpected page response");
  console.log("Browserless connection successful. Test page loaded. No job application submitted.");
} finally {
  if (browser) await browser.close();
}
