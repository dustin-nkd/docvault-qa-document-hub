import { readFileSync } from 'fs';
const html = readFileSync('docvault.js', 'utf8');
const lines = html.split('\n');
const start = lines.findIndex(l => l.includes('function renderViewer()'));
console.log(lines.slice(start, start + 20).join('\n'));
