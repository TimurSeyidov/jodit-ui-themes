// Assemble the GitHub Pages demo into _site/: the pages from site/ (with the
// Jodit versions from devDependencies), the built CSS of every theme and
// themes.json (package version, theme names and descriptions).
//
// Usage: node scripts/site.js, then serve _site/ (e.g. python3 -m http.server)

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { description, themeNames } from './readme.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'site');
const out = path.join(root, '_site');

async function main() {
	const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
	const versions = {
		'%JODIT%': pkg.devDependencies.jodit,
		'%JODIT_PRO%': pkg.devDependencies['jodit-pro']
	};

	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });

	for (const file of await readdir(source)) {
		const from = path.join(source, file);
		const to = path.join(out, file);

		if (file.endsWith('.html')) {
			let html = await readFile(from, 'utf8');
			for (const [key, value] of Object.entries(versions)) {
				html = html.replaceAll(key, value);
			}
			await writeFile(to, html);
		} else {
			await copyFile(from, to);
		}
	}

	const themes = [];
	for (const theme of await themeNames()) {
		const dir = path.join(out, 'themes', theme);
		await mkdir(dir, { recursive: true });

		for (const file of await readdir(path.join(root, 'themes', theme))) {
			if (file.endsWith('.css') && !file.startsWith('_')) {
				await copyFile(path.join(root, 'themes', theme, file), path.join(dir, file));
			}
		}

		themes.push({ name: theme, description: await description(theme) });
	}

	// GitHub Pages: serve files as they are, without Jekyll processing
	await writeFile(path.join(out, '.nojekyll'), '');
	await writeFile(
		path.join(out, 'themes.json'),
		JSON.stringify({ version: pkg.version, themes }, null, '\t') + '\n'
	);

	console.log(`_site: ${themes.length} themes, jodit ${versions['%JODIT%']}, jodit-pro ${versions['%JODIT_PRO%']}`);
}

main().catch(error => {
	console.error(error.message);
	process.exitCode = 1;
});
