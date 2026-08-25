import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

(async () => {
  console.log('--- Starting Sophie Golf Acceptance & Network Smoke Test ---');

  // Start Vite server on port 5198
  const vite = spawn('cmd', ['/c', 'npx', 'vite', '--port', '5198'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  let serverReady = false;
  vite.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('5198') || str.includes('Local:')) {
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
    const requests = [];
    const consoleLogs = [];
    const consoleErrors = [];

    page.on('request', (req) => {
      requests.push(req.url());
    });

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.toString());
      console.error('[Browser PageError]:', err);
    });

    console.log('Navigating to http://localhost:5198 ...');
    await page.goto('http://localhost:5198', { waitUntil: 'networkidle0' });

    await page.waitForFunction(() => {
      const el = document.getElementById('loading-screen');
      return el && el.style.display === 'none';
    }, { timeout: 10000 });

    await new Promise((r) => setTimeout(r, 600));

    // 1. Verify Title Screen
    console.log('1. Verifying Title Screen...');
    const titleCourse = await page.$eval('.title-course', el => el.textContent);
    console.log('Title course text:', titleCourse);
    if (!titleCourse.includes('Sophie Hills')) {
      throw new Error(`Expected title screen to show Sophie Hills, but got: "${titleCourse}"`);
    }

    const titleNote = await page.$eval('.title-note', el => el.textContent);
    console.log('Title note text:', titleNote);
    if (!titleNote.includes('fictional')) {
      throw new Error(`Expected title note to mention fictional, but got: "${titleNote}"`);
    }

    // 2. Start Round (Hole 1)
    console.log('2. Clicking START ROUND button...');
    await page.click('#btn-title-start');
    await new Promise(r => setTimeout(r, 800));

    // Verify Hole 1 HUD
    const hudHeader = await page.$eval('#hud-title', el => el.textContent);
    const hudSubtitle = await page.$eval('#hud-subtitle', el => el.textContent);
    console.log('HUD Header:', hudHeader);
    console.log('HUD Subtitle:', hudSubtitle);

    if (!hudHeader.includes('HOLE 1')) {
      throw new Error(`Expected HUD to show HOLE 1, but got: "${hudHeader}"`);
    }
    if (!hudSubtitle.includes('Sophie Hills') || !hudSubtitle.includes('Sunset Run')) {
      throw new Error(`Expected HUD subtitle to show Sophie Hills — Sunset Run, but got: "${hudSubtitle}"`);
    }

    // Check Network Requests during Normal Play
    console.log('3. Inspecting network requests during normal gameplay...');
    const warragulRequests = requests.filter(url => url.includes('/courses/warragul/'));
    console.log('Warragul requests during normal play:', warragulRequests);
    if (warragulRequests.length > 0) {
      throw new Error(`FAIL: Normal play requested Warragul assets! ${JSON.stringify(warragulRequests)}`);
    }
    console.log('✓ PASS: Zero requests made to /courses/warragul/ during normal gameplay!');

    const sophieRequests = requests.filter(url => url.includes('/courses/sophie-hills/'));
    console.log(`Sophie Hills requests count: ${sophieRequests.length}`);
    if (sophieRequests.length === 0) {
      throw new Error('FAIL: Expected requests to /courses/sophie-hills/, but found none.');
    }
    console.log('✓ PASS: Successfully loaded Sophie Hills terrain & hole data!');

    // 4. Test Return to Title & Warragul Research Mode
    console.log('4. Testing Return to Title & Warragul Research Mode...');
    await page.click('#btn-hud-replay');
    await new Promise(r => setTimeout(r, 600));

    console.log('Clicking WARRAGUL RESEARCH MODE button...');
    await page.click('#btn-title-practice');
    await new Promise(r => setTimeout(r, 1500));

    const researchRequests = requests.filter(url => url.includes('/courses/warragul/'));
    console.log(`Warragul requests in Research Mode: ${researchRequests.length}`);
    if (researchRequests.length === 0) {
      throw new Error('FAIL: Warragul Research Mode did not load Warragul assets.');
    }
    console.log('✓ PASS: Warragul Research Mode properly loaded Warragul LiDAR assets!');

    // Check for console errors
    const criticalErrors = consoleErrors.filter(err => !err.includes('favicon'));
    if (criticalErrors.length > 0) {
      throw new Error(`FAIL: Browser console errors detected:\n${criticalErrors.join('\n')}`);
    }
    console.log('✓ PASS: Zero browser console errors!');

    console.log('\n========================================');
    console.log('ALL ACCEPTANCE & NETWORK CRITERIA PASSED!');
    console.log('========================================\n');
  } finally {
    await browser.close();
    vite.kill();
  }
})().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});