const express = require('express');
const puppeteer = require('puppeteer');
const AdmZip = require("adm-zip");
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/extract', async (req, res) => {
    const targetUrl = req.body.url;
    if (!targetUrl) return res.status(400).send("URL required");

    console.log(`\n[*] Starting extraction for: ${targetUrl}`);
    const assets = new Map();

    try {
        // Cloud pe Chromium khud banta hai
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        
        page.on('response', async (response) => {
            const reqUrl = response.url();
            const contentType = response.headers()['content-type'] || '';
            if (reqUrl.endsWith('.css') || reqUrl.endsWith('.js') || contentType.includes('css') || contentType.includes('javascript')) {
                try {
                    const buffer = await response.buffer();
                    assets.set(reqUrl, buffer);
                } catch (e) {}
            }
        });

        console.log("[*] Opening page...");
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        console.log("[*] Scrolling...");
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 4000));

        const html = await page.content();
        await browser.close();
        console.log(`[+] Captured HTML and ${assets.size} assets.`);

        const zip = new AdmZip();
        zip.addFile('index.html', Buffer.from(html, 'utf-8'));

        for (const [assetUrl, buffer] of assets) {
            const parsed = new URL(assetUrl);
            const filePath = parsed.pathname.substring(1);
            if (filePath) {
                zip.addFile(filePath, buffer);
            }
        }

        const zipPath = path.join(__dirname, 'extracted.zip');
        zip.writeZip(zipPath);

        console.log(`[+] Zip created. Downloading...`);
        res.download(zipPath, 'source_code.zip', () => {
            fs.unlinkSync(zipPath); 
        });

    } catch (error) {
        console.error("\n[!] ERROR:", error.message);
        res.status(500).send("Extraction failed: " + error.message);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));