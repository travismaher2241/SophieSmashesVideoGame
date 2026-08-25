import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

(async () => {
  console.log('--- Starting Visual Rebuild Screenshot Capture ---');

  const brainDir = 'C:\\Users\\travi\\.gemini\\antigravity\\brain\\d988a64d-ea07-44f0-8079-1ac9c15b52d0';
  if (!fs.existsSync(brainDir)) {
    fs.mkdirSync(brainDir, { recursive: true });
  }

  // Start Vite server on port 5197
  const vite = spawn('cmd', ['/c', 'npx', 'vite', '--port', '5197'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  let serverReady = false;
  vite.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('5197') || str.includes('Local:')) {
      serverReady = true;
    }
  });
  vite.stderr.on('data', (d) => console.error('Vite err:', d.toString()));

  for (let i = 0; i < 40; i++) {
    if (serverReady) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => console.log(`[Browser ${msg.type()}]:`, msg.text()));

    console.log('Navigating to http://localhost:5197 ...');
    await page.goto('http://localhost:5197', { waitUntil: 'networkidle0' });

    await page.waitForFunction(() => {
      const el = document.getElementById('loading-screen');
      return el && el.style.display === 'none';
    }, { timeout: 10000 });

    await new Promise((r) => setTimeout(r, 500));

    // Start Round from Title Screen
    console.log('Clicking START ROUND button...');
    await page.click('#btn-title-start');
    await new Promise((r) => setTimeout(r, 800));

    // 1. Capture Tee Shot Setup
    console.log('1. Capturing Tee Shot Setup...');
    await page.screenshot({ path: path.join(brainDir, 'tee_shot_setup.png') });

    // 2. Trigger Shot 1 with swing meter & capture ball flight with tracer
    console.log('Starting Swing (Click 1: Start)...');
    await page.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 450));

    console.log('Click 2: Set Power (~90%)...');
    await page.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 195));

    console.log('Click 3: Strike Sweet Spot...');
    await page.keyboard.press('Space');

    // Wait for swing follow-through and mid-air ball flight
    await new Promise((r) => setTimeout(r, 1100));
    console.log('3. Capturing Ball Flight with Tracer...');
    await page.screenshot({ path: path.join(brainDir, 'ball_flight.png') });

    // Wait for ball to land on fairway and come to full rest
    console.log('Waiting for ball to settle on fairway...');
    await new Promise((r) => setTimeout(r, 7000));

    // 2. Capture Approach Shot View (Shot 2 on fairway)
    console.log('2. Capturing Approach Shot (Fairway Address)...');
    await page.screenshot({ path: path.join(brainDir, 'approach_shot.png') });

    // 4. Trigger Approach Shot towards green (e.g. Pitching Wedge / 9 Iron)
    console.log('Executing Approach Shot to green...');
    await page.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 380));
    await page.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 195));
    await page.keyboard.press('Space');

    // Wait for approach shot to settle near/on green
    await new Promise((r) => setTimeout(r, 6500));

    // 4. Capture Greenside View
    console.log('4. Capturing Greenside Shot...');
    await page.screenshot({ path: path.join(brainDir, 'greenside_shot.png') });

    // 5. If putting, capture putting view
    console.log('5. Capturing Putting View...');
    await page.screenshot({ path: path.join(brainDir, 'putting_view.png') });

    console.log('\nAll 5 visual rebuild screenshots captured successfully!');
  } finally {
    await browser.close();
    vite.kill();
  }
})().catch((err) => {
  console.error('Screenshot capture error:', err);
  process.exit(1);
});