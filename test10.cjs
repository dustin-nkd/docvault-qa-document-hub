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
            initialEditType: 'wysiwyg',
            initialValue: ''
        });
        editor.setHTML('<p># Hello</p>');
        return editor.getMarkdown();
    });
    console.log(result);
    await browser.close();
})();
