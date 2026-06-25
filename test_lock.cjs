const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        
        const htmlPath = 'file:///' + process.cwd().replace(/\\/g, '/') + '/index.html';
        await page.goto(htmlPath, {waitUntil: 'networkidle0'});
        
        // Wait and check if lock screen is visible
        const lockScreenVisible = await page.evaluate(() => {
            const el = document.getElementById('lock-screen');
            return el && !el.classList.contains('hidden');
        });
        
        console.log('Lock Screen Visible:', lockScreenVisible);
        
        await browser.close();
    } catch(e) {
        console.error(e);
    }
})();
