const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        
        const htmlPath = 'file:///' + process.cwd().replace(/\\/g, '/') + '/index.html';
        await page.goto(htmlPath, {waitUntil: 'networkidle0'});
        
        // Check if openSearch exists
        const hasSearch = await page.evaluate(() => typeof window.openSearch === 'function');
        console.log('openSearch exists:', hasSearch);
        
        await browser.close();
    } catch(e) {
        console.error(e);
    }
})();
