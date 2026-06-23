const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const htmlPath = 'file:///' + process.cwd().replace(/\\/g, '/') + '/test3.html';
    await page.goto(htmlPath);
    const result = await page.evaluate(() => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const editor = new toastui.Editor({
            el: el,
            initialEditType: 'markdown',
            initialValue: ["`js", "const a = 1;", "`"].join("\n")
        });
        return el.innerHTML;
    });
    console.log(result.includes('<pre'));
    await browser.close();
})();
