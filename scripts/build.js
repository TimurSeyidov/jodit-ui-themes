// Compile every themes/<name>/*.less into .css and .min.css next to it.
// Names starting with `_` are partials (themes/_base, themes/<name>/_theme.less):
// they are imported by the themes and not compiled on their own.
// Usage: node scripts/build.js [--watch]

import CleanCSS from 'clean-css';
import less from 'less';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const themesDir = path.join(root, 'themes');
const minifier = new CleanCSS({ level: 1 });

async function lessFiles() {
	const themes = await readdir(themesDir, { withFileTypes: true });
	const files = [];

	for (const theme of themes.filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))) {
		const dir = path.join(themesDir, theme.name);

		for (const file of await readdir(dir)) {
			if (file.endsWith('.less') && !file.startsWith('_')) {
				files.push(path.join(dir, file));
			}
		}
	}

	return files;
}

function describe(error) {
	return error.filename
		? `${path.relative(root, error.filename)}:${error.line}: ${error.message}`
		: error.message;
}

async function compile(file) {
	const source = await readFile(file, 'utf8');
	const { css } = await less.render(source, { filename: file });
	const min = minifier.minify(css);

	if (min.errors.length) {
		throw new Error(min.errors.join('\n'));
	}

	const base = file.slice(0, -'.less'.length);
	await writeFile(`${base}.css`, css);
	await writeFile(`${base}.min.css`, min.styles + '\n');

	return `${path.relative(root, base)}.css (${css.length} B, min ${min.styles.length} B)`;
}

async function build() {
	for (const file of await lessFiles()) {
		console.log(await compile(file));
	}
}

try {
	await build();
} catch (error) {
	console.error(describe(error));
	process.exitCode = 1;
}

if (process.argv.includes('--watch')) {
	let timer;
	console.log('Watching themes/ for changes...');

	watch(themesDir, { recursive: true }, (event, file) => {
		if (!file?.endsWith('.less')) {
			return;
		}

		clearTimeout(timer);
		timer = setTimeout(() => build().catch(error => console.error(describe(error))), 100);
	});
}
