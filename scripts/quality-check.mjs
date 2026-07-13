import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const jsFiles = [
    'storage.js',
    'sw.js',
    'main.js',
    ...fs.readdirSync(path.join(root, 'js'))
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => path.join('js', name))
];

for (const relativePath of jsFiles.filter((value) => value !== 'main.js')) {
    new vm.Script(read(relativePath), { filename: relativePath });
}
const mainSource = read('main.js');
const mainImport = mainSource.match(/^import\s+["'](.+?)["'];?\s*$/m);
assert(mainImport, 'main.js must contain a static stylesheet import');
assert(fs.existsSync(path.join(root, mainImport[1])), 'main.js imports a missing asset: ' + mainImport[1]);

const html = read('index.html');
assert(/<html\s+lang=["']en["']/.test(html), 'index.html must declare lang="en"');

const localRefs = [...html.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => match[1].split('?')[0])
    .filter((value) => !/^(?:[a-z]+:|\/\/|data:)/i.test(value));
const missingHtmlRefs = localRefs.filter((value) => !fs.existsSync(path.join(root, value.replace(/^\.\//, ''))));
assert(missingHtmlRefs.length === 0, 'Missing local index.html assets: ' + missingHtmlRefs.join(', '));

const sw = read('sw.js');
const shellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert(shellMatch, 'Unable to read APP_SHELL from sw.js');
const shellRefs = [...shellMatch[1].matchAll(/["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
const missingShellRefs = shellRefs.filter((value) => {
    if (value === './') return false;
    return !fs.existsSync(path.join(root, value.slice(2)));
});
assert(missingShellRefs.length === 0, 'Missing service-worker app-shell assets: ' + missingShellRefs.join(', '));
assert(shellRefs.includes('./vendor/fonts/space-grotesk/latin.css'), 'APP_SHELL must cache the Latin Space Grotesk stylesheet');
assert(shellRefs.includes('./vendor/fonts/dm-sans/latin.css'), 'APP_SHELL must cache the Latin DM Sans stylesheet');
assert(!shellRefs.some((value) => /vendor\/fonts\/[^/]+\/index\.css$/.test(value)), 'APP_SHELL still references an all-language font stylesheet');

const runtimeSource = [html, ...jsFiles.map(read)].join('\n');
for (const legacyToken of ['STRINGS_VI', 'CURRENT_LANG', 'toggleLang', 'docvault_lang', 'vi-VN']) {
    assert(!runtimeSource.includes(legacyToken), 'Legacy localization token found: ' + legacyToken);
}

const constants = read('js/constants.js');
const dictMatch = constants.match(/const STRINGS = \{([\s\S]*?)\r?\n\};\r?\n\r?\nfunction t/);
assert(dictMatch, 'Unable to read the English STRINGS dictionary');
const dictionary = vm.runInNewContext('({' + dictMatch[1] + '\n})');
const allJsSource = jsFiles.map(read).join('\n');
const referencedKeys = new Set(
    [...allJsSource.matchAll(/\bt\(["']([A-Za-z][A-Za-z0-9]*)["']/g)].map((match) => match[1])
);
const missingKeys = [...referencedKeys].filter((key) => !(key in dictionary)).sort();
assert(missingKeys.length === 0, 'Missing English STRINGS keys: ' + missingKeys.join(', '));

console.log('Quality gate passed');
console.log('  JavaScript syntax:', jsFiles.length, 'files');
console.log('  Local HTML assets:', localRefs.length, 'references');
console.log('  Offline app shell:', shellRefs.length, 'assets');
console.log('  English UI strings:', referencedKeys.size, 'static keys');
