const http = require('https');
http.get('https://raw.githubusercontent.com/nhn/tui.editor/master/apps/editor/docs/en/viewer.md', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(data.slice(0, 1000)));
});
