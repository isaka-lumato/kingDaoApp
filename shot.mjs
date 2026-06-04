import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await p.screenshot({ path: 'login-shot.png' });
await b.close();
