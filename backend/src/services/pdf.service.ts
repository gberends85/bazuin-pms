import puppeteer from 'puppeteer-core';

// Zoekt een bruikbare Chromium/Chrome op de server.
function findChromium(): string {
  const fs = require('fs');
  const candidates = ['/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* volgende proberen */ }
  }
  return '/usr/bin/chromium-browser';
}

// Rendert HTML naar een A4-PDF (gedeeld door contract- en groepsfacturen).
export async function htmlToPdfA4(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
