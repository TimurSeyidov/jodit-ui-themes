// Take screenshots of every theme and update the theme list in README.md.
//
// For each themes/<name>/ the script opens Jodit and Jodit PRO in a headless
// browser and saves themes/<name>/screenshots/{main,editor,finder,finder-pro}.png.
// File browsers talk to a built-in fake connector with fixed files and
// dates, so the pictures do not depend on any real backend.
//
// Usage: node scripts/screenshots.js [theme ...]

import { chromium } from 'playwright';
import { themeNames, updateReadme } from './readme.js';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const themesDir = path.join(root, 'themes');

const VIEWPORT = { width: 1100, height: 800 };

// Editor and file browser sizes; `main` shows the file browser over a taller editor
const LAYOUTS = {
	single: { editor: [1050, 340], browser: [960, 600] },
	main: { editor: [1050, 600], browser: [760, 440] }
};

const EDITIONS = {
	free: {
		css: ['/node_modules/jodit/es2021/jodit.min.css'],
		js: ['/node_modules/jodit/es2021/jodit.min.js']
	},
	pro: {
		css: [
			'/node_modules/jodit-pro/es2021/jodit.min.css',
			'/node_modules/jodit-pro/es2021/plugins/finder/finder.min.css'
		],
		js: [
			'/node_modules/jodit-pro/es2021/jodit.min.js',
			'/node_modules/jodit-pro/es2021/plugins/finder/finder.min.js'
		]
	}
};

const CONTENT = `
	<h2>Quarterly report</h2>
	<p>Sales grew by <strong>12%</strong> compared to the last quarter. See the <a href="#">full table</a> for details.</p>
	<ul><li>New customers: 140</li><li>Returning customers: 380</li></ul>`;

// Fake file storage: [name, palette, size]
const PHOTOS = [
	['beach.jpg', ['#7ec8f0', '#fbe3a1', '#f2c46d', '#2a8fbd'], '184.2KB'],
	['city.jpg', ['#3b4a7a', '#f6a96c', '#5b5f8f', '#252c4a'], '226.7KB'],
	['forest.jpg', ['#a8d8b9', '#f1f7d2', '#4f9a63', '#2e6b3f'], '205.1KB'],
	['mountains.jpg', ['#9cc3e8', '#ffffff', '#7d8fa8', '#4c5d78'], '312.9KB'],
	['sunset.jpg', ['#f7797d', '#fbd786', '#c06c84', '#6c5b7b'], '158.4KB'],
	['lake.jpg', ['#89c4f4', '#e0f4ff', '#3e8ec4', '#1f5f8b'], '241.0KB']
];
const FOLDERS = ['images', 'documents'];
const CHANGED = '05/14/2026 10:30 AM';

function photo([, [sky, sun, hill, ground]]) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
	<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${sun}"/></linearGradient></defs>
	<rect width="400" height="300" fill="url(#s)"/>
	<circle cx="300" cy="90" r="38" fill="${sun}" opacity="0.9"/>
	<path d="M0 210 L90 130 L170 200 L260 110 L400 220 V300 H0 Z" fill="${hill}"/>
	<path d="M0 250 Q120 215 220 245 T400 240 V300 H0 Z" fill="${ground}"/>
</svg>`;
}

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="56" viewBox="0 0 16 14">
	<path d="M1 2.5C1 1.7 1.7 1 2.5 1h3.6l1.6 1.6h5.8c.8 0 1.5.7 1.5 1.5v7.4c0 .8-.7 1.5-1.5 1.5h-11C1.7 13 1 12.3 1 11.5z" fill="#e8b84a"/>
	<path d="M1 5h14v6.5c0 .8-.7 1.5-1.5 1.5h-11C1.7 13 1 12.3 1 11.5z" fill="#fbd96e"/>
</svg>`;

function source(extra) {
	return {
		name: 'default',
		title: 'Demo files',
		baseurl: '/__files/',
		path: '/',
		...extra
	};
}

// Answers of a Jodit file browser connector
function connector(params) {
	const action = params.get('action');
	const withFolders = params.get('mods[withFolders]') === 'true';
	const ok = data => ({ success: true, data: { code: 220, ...data } });

	if (action === 'permissions') {
		const names = ['Files', 'FileMove', 'FileCopy', 'FileUpload', 'FileRemove', 'FileRename', 'FileDownload', 'Folders', 'FolderMove', 'FolderCopy', 'FolderCreate', 'FolderRemove', 'FolderRename', 'FolderTree', 'ImageResize', 'ImageCrop'];
		return ok({ permissions: Object.fromEntries(names.map(name => [`allow${name}`, true])) });
	}

	if (action === 'folders') {
		return ok({ sources: [source({ folders: ['.', ...FOLDERS], files: [] })] });
	}

	if (action === 'files') {
		const folders = withFolders
			? FOLDERS.map(name => ({ file: name, name, type: 'folder', thumb: `${name}.folder.svg` }))
			: [];
		const files = PHOTOS.map(([name, , size]) => ({
			file: name,
			name,
			type: 'image',
			isImage: true,
			size,
			changed: CHANGED,
			thumb: name
		}));

		return ok({ sources: [source({ files: [...folders, ...files] })] });
	}

	return { success: false, data: { code: 400, messages: [`Unsupported action: ${action}`] } };
}

function page(edition, theme, layout) {
	const { css, js } = EDITIONS[edition];
	const { editor, browser } = LAYOUTS[layout] ?? LAYOUTS.single;
	const builtIn = theme === 'default';

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<link rel="icon" href="data:," />
	${css.map(href => `<link rel="stylesheet" href="${href}" />`).join('\n\t')}
	${builtIn ? '' : `<link rel="stylesheet" href="/themes/${theme}/${theme}.all.css" />`}
	${js.map(src => `<script src="${src}"></script>`).join('\n\t')}
	<style>
		body { margin: 0; padding: 24px; background: #fff; font-family: 'Helvetica Neue', arial, sans-serif; }
		.jodit-ui-tooltip { display: none !important; }
		*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
	</style>
</head>
<body>
	<textarea id="editor">${CONTENT}</textarea>
	<script>
		window.editor = Jodit.make('#editor', {
			theme: ${JSON.stringify(theme)},
			width: ${editor[0]},
			height: ${editor[1]},
			toolbarAdaptive: false,
			showCharsCounter: false,
			showWordsCounter: false,
			showXPathInStatusbar: false,
			filebrowser: {
				theme: ${JSON.stringify(theme)},
				width: ${browser[0]},
				height: ${browser[1]},
				ajax: { url: '/__connector' }
			},
			uploader: { url: '/__connector?action=fileUpload' }
		});
	</script>
</body>
</html>`;
}

const TYPES = {
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2'
};

function serve() {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url, 'http://localhost');
		const send = (status, type, body) => {
			res.writeHead(status, { 'content-type': type });
			res.end(body);
		};

		try {
			if (url.pathname === '/__connector') {
				let body = '';
				for await (const chunk of req) {
					body += chunk;
				}
				const params = new URLSearchParams(req.method === 'POST' ? body : url.search);
				return send(200, 'application/json', JSON.stringify(connector(params)));
			}

			if (url.pathname.startsWith('/__page/')) {
				const [edition, theme, layout] = url.pathname.split('/').slice(2);
				return send(200, 'text/html', page(edition, theme, layout));
			}

			if (url.pathname.startsWith('/__files/')) {
				const name = decodeURIComponent(url.pathname.slice('/__files/'.length));
				const item = PHOTOS.find(([file]) => file === name);
				return name.endsWith('.folder.svg')
					? send(200, 'image/svg+xml', FOLDER_ICON)
					: item
						? send(200, 'image/svg+xml', photo(item))
						: send(404, 'text/plain', 'Not found');
			}

			const file = path.join(root, decodeURIComponent(url.pathname));
			if (!file.startsWith(root + path.sep)) {
				return send(403, 'text/plain', 'Forbidden');
			}
			const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
			return send(200, type, await readFile(file));
		} catch {
			return send(404, 'text/plain', 'Not found');
		}
	});

	return new Promise(resolve => {
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

async function launch() {
	try {
		return await chromium.launch();
	} catch {
		// No bundled Chromium (npx playwright install chromium): use the system Chrome
		return chromium.launch({ channel: 'chrome' });
	}
}

// Screenshot of the union of the elements' boxes plus a margin
async function shoot(page, selectors, file) {
	const boxes = [];

	for (const selector of selectors) {
		for (const el of await page.locator(selector).all()) {
			if (await el.isVisible()) {
				boxes.push(await el.boundingBox());
			}
		}
	}

	const pad = 12;
	const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
	const y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
	const right = Math.max(...boxes.map(b => b.x + b.width)) + pad;
	const bottom = Math.max(...boxes.map(b => b.y + b.height)) + pad;

	await page.screenshot({
		path: file,
		clip: { x, y, width: right - x, height: bottom - y }
	});
}

// Leave only the dialog on a blank page
async function hideEditor(page) {
	await page.evaluate(() => {
		document.querySelector('.jodit-container').style.visibility = 'hidden';
	});
}

async function settle(page) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(300);
}

async function open(browser, base, edition, theme, layout = 'single') {
	const page = await browser.newPage({ viewport: VIEWPORT });
	page.on('pageerror', error => console.warn(`  ${edition}: ${error.message}`));
	await page.goto(`${base}/__page/${edition}/${theme}/${layout}`);
	await page.waitForSelector('.jodit-toolbar__box');
	await settle(page);
	return page;
}

async function screenshots(browser, base, theme) {
	const dir = path.join(themesDir, theme, 'screenshots');
	await mkdir(dir, { recursive: true });

	// Main: the file browser over the editor
	let page = await open(browser, base, 'free', theme, 'main');
	await page.locator('.jodit-wysiwyg strong').dblclick();
	await page.evaluate(() => editor.filebrowser.open(() => {}));
	await page.waitForSelector('.jodit-file-browser-files__item img');
	await page.locator('.jodit-file-browser-files__item').nth(1).click();
	await page.mouse.move(0, 0);
	await settle(page);
	await shoot(page, ['.jodit-container', '.jodit-dialog_active_true .jodit-dialog__panel'], path.join(dir, 'main.png'));
	await page.close();

	// Editor: bold text selected, paragraph menu open with a hovered item
	page = await open(browser, base, 'free', theme);
	await page.locator('.jodit-wysiwyg strong').dblclick();
	await page.locator('.jodit-toolbar-button_paragraph .jodit-toolbar-button__trigger').click();
	await page.locator('.jodit-popup .jodit-toolbar-button').nth(2).hover();
	await settle(page);
	await shoot(page, ['.jodit-container', '.jodit-popup'], path.join(dir, 'editor.png'));
	await page.close();

	// Free file browser with a selected file
	page = await open(browser, base, 'free', theme);
	await page.evaluate(() => editor.filebrowser.open(() => {}));
	await page.waitForSelector('.jodit-file-browser-files__item img');
	await page.locator('.jodit-file-browser-files__item').nth(1).click();
	await page.mouse.move(0, 0);
	await hideEditor(page);
	await settle(page);
	await shoot(page, ['.jodit-dialog_active_true .jodit-dialog__panel'], path.join(dir, 'finder.png'));
	await page.close();

	// Jodit PRO finder with a selected file
	page = await open(browser, base, 'pro', theme);
	await page.evaluate(() => editor.filebrowser.open(() => {}));
	await page.waitForSelector('.jodit-ui-browser-item_type_image');
	await page.locator('.jodit-ui-browser-item_type_image').nth(1).click();
	await page.mouse.move(0, 0);
	await hideEditor(page);
	await settle(page);
	await shoot(page, ['.jodit-file-browser-pro__panel'], path.join(dir, 'finder-pro.png'));
	await page.close();
}

async function main() {
	const all = await themeNames();
	const requested = process.argv.slice(2);
	const unknown = requested.filter(theme => !all.includes(theme));

	if (unknown.length) {
		throw new Error(`Unknown theme: ${unknown.join(', ')}`);
	}

	const server = await serve();
	const base = `http://127.0.0.1:${server.address().port}`;
	const browser = await launch();

	try {
		for (const theme of requested.length ? requested : all) {
			console.log(`${theme}: taking screenshots`);
			await screenshots(browser, base, theme);
		}
	} finally {
		await browser.close();
		server.close();
	}

	// The list always covers every theme
	await updateReadme();
}

main().catch(error => {
	console.error(error.message);
	process.exitCode = 1;
});
