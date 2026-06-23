const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const htmlPath = 'file:///' + process.cwd().replace(/\\/g, '/') + '/test3.html';
    await page.goto(htmlPath);
    const keys = await page.evaluate(() => Object.keys(toastui.Editor));
    console.log(keys);
    await browser.close();
})();
