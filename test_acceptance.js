import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

(async () => {
  console.log('--- Starting Sophie Framing & Swing Presentation Test ---');

  const brainDir = 'C:\\Users\\travi\\.gemini\\antigravity\\brain\\d988a64d-ea07-44f0-8079-1ac9c15b52d0';
  if (!fs.existsSync(brainDir)) {
    fs.mkdirSync(brainDir, { recursive: true });
  }

  // Start Vite server on port 5199
  const vite = spawn('cmd', ['/c', 'npx', 'vite', '--port', '5199'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  let serverReady = false;
  vite.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('5199') || str.includes('Local:')) {
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
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // ==========================================
    // 1. TEST DESKTOP VIEWPORT (1280 x 720)
    // ==========================================
    console.log('\n--- 1. Testing Desktop Viewport (1280x720) ---');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1280, height: 720 });
    await desktopPage.goto('http://localhost:5199', { waitUntil: 'networkidle0' });

    await desktopPage.waitForFunction(() => {
      const el = document.getElementById('loading-screen');
      return el && el.style.display === 'none';
    }, { timeout: 10000 });

    await new Promise((r) => setTimeout(r, 400));
    await desktopPage.click('#btn-title-start');
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturing Desktop 1: Address Setup...');
    await desktopPage.screenshot({ path: path.join(brainDir, 'desktop_1_address.png') });

    // Click 1: Start Swing -> Backswing
    console.log('Click 1: Start Swing (Backswing)...');
    await desktopPage.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 220));
    console.log('Capturing Desktop 2: Backswing...');
    await desktopPage.screenshot({ path: path.join(brainDir, 'desktop_2_backswing.png') });

    // Click 2: Lock Power -> Downswing / Impact stance
    await new Promise((r) => setTimeout(r, 230));
    console.log('Click 2: Lock Power (Downswing & Impact)...');
    await desktopPage.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 120));
    console.log('Capturing Desktop 3: Downswing & Impact...');
    await desktopPage.screenshot({ path: path.join(brainDir, 'desktop_3_impact.png') });

    // Click 3: Lock Accuracy -> Strike Impact & Follow-through
    await new Promise((r) => setTimeout(r, 120));
    console.log('Click 3: Strike Sweet Spot (Follow-Through)...');
    await desktopPage.keyboard.press('Space');
    await new Promise((r) => setTimeout(r, 120));
    console.log('Capturing Desktop 4: Follow-Through...');
    await desktopPage.screenshot({ path: path.join(brainDir, 'desktop_4_follow_through.png') });

    await desktopPage.close();

    // ==========================================
    // 2. TEST MOBILE PORTRAIT VIEWPORT (390 x 844)
    // ==========================================
    console.log('\n--- 2. Testing Mobile Portrait Viewport (390x844) ---');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilePage.goto('http://localhost:5199', { waitUntil: 'networkidle0' });

    await mobilePage.waitForFunction(() => {
      const el = document.getElementById('loading-screen');
      return el && el.style.display === 'none';
    }, { timeout: 10000 });

    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.click('#btn-title-start');
    await new Promise((r) => setTimeout(r, 800));

    console.log('Capturing Mobile 1: Address Setup...');
    await mobilePage.screenshot({ path: path.join(brainDir, 'mobile_1_address.png') });

    // Click 1 on Mobile: Backswing
    console.log('Mobile Click 1: Start (Backswing)...');
    await mobilePage.click('#btn-trigger-swing');
    await new Promise((r) => setTimeout(r, 220));
    console.log('Capturing Mobile 2: Backswing...');
    await mobilePage.screenshot({ path: path.join(brainDir, 'mobile_2_backswing.png') });

    // Click 2 on Mobile: Downswing
    await new Promise((r) => setTimeout(r, 230));
    console.log('Mobile Click 2: Lock Power (Downswing)...');
    await mobilePage.click('#btn-trigger-swing');
    await new Promise((r) => setTimeout(r, 120));
    console.log('Capturing Mobile 3: Downswing & Impact...');
    await mobilePage.screenshot({ path: path.join(brainDir, 'mobile_3_impact.png') });

    // Click 3 on Mobile: Follow-through
    await new Promise((r) => setTimeout(r, 120));
    console.log('Mobile Click 3: Strike (Follow-Through)...');
    await mobilePage.click('#btn-trigger-swing');
    await new Promise((r) => setTimeout(r, 120));
    console.log('Capturing Mobile 4: Follow-Through...');
    await mobilePage.screenshot({ path: path.join(brainDir, 'mobile_4_follow_through.png') });

    await mobilePage.close();

    console.log('\nAll framing and swing presentation tests completed successfully!');
  } finally {
    await browser.close();
    vite.kill();
  }
})().catch((err) => {
  console.error('Framing test error:', err);
  process.exit(1);
});