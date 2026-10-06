// Rewrite the theme list in README.md: for every themes/<name>/ its name,
// the description from themes/<name>/README.md, a ready-to-copy CDN <link>
// for the current package version and the screenshots.
//
// Usage: node scripts/readme.js (also called by scripts/screenshots.js and
// by `npm version`, so the CDN links follow the released version)

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const themesDir = path.join(root, 'themes');
const readme = path.join(root, 'README.md');

const LIST_START = '<!-- themes:start -->';
const LIST_END = '<!-- themes:end -->';

// Screenshots are not part of the npm package: link them on GitHub so they
// show on both GitHub and npmjs.com
const SCREENSHOTS = 'https://raw.githubusercontent.com/TimurSeyidov/jodit-ui-themes/main/themes';

export async function themeNames() {
	return (await readdir(themesDir, { withFileTypes: true }))
		.filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
		.map(entry => entry.name)
		.sort();
}

// Description from themes/<name>/README.md without its title
export async function description(theme) {
	try {
		const text = await readFile(path.join(themesDir, theme, 'README.md'), 'utf8');
		return text.replace(/^# .*\n/, '').trim();
	} catch {
		console.warn(`${theme}: no themes/${theme}/README.md, description skipped`);
		return '';
	}
}

async function section(theme, pkg) {
	const image = (shot, alt) =>
		`<img src="${SCREENSHOTS}/${theme}/screenshots/${shot}.png" alt="${theme}: ${alt}" />`;
	const css = `https://cdn.jsdelivr.net/npm/${pkg.name}@${pkg.version}/themes/${theme}/${theme}.all.min.css`;

	return [
		`### ${theme}`,
		await description(theme),
		'```html\n' + `<link rel="stylesheet" href="${css}" />` + '\n```',
		image('main', 'file browser over the editor'),
		`| Editor | Finder | Finder (Jodit PRO) |
|---|---|---|
| ${image('editor', 'editor')} | ${image('finder', 'file browser')} | ${image('finder-pro', 'Jodit PRO finder')} |`
	]
		.filter(Boolean)
		.join('\n\n');
}

export async function updateReadme() {
	const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
	const text = await readFile(readme, 'utf8');
	const start = text.indexOf(LIST_START);
	const end = text.indexOf(LIST_END);

	if (start === -1 || end < start) {
		throw new Error(`README.md has no ${LIST_START} ... ${LIST_END} block`);
	}

	const sections = [];
	for (const theme of await themeNames()) {
		sections.push(await section(theme, pkg));
	}

	const updated =
		text.slice(0, start + LIST_START.length) +
		'\n\n' +
		sections.join('\n\n') +
		'\n\n' +
		text.slice(end);

	await writeFile(readme, updated);
	console.log(`README.md: theme list updated (${pkg.name}@${pkg.version})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	updateReadme().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
