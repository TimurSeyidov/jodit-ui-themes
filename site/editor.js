// Shared setup of the demo editor pages (free.html, pro.html): theme from
// the `theme` query parameter, the demo connector, a toast for fake actions.

(function () {
	const params = new URLSearchParams(location.search);
	const theme = params.get('theme') || 'default';
	const BUILT_IN = ['default', 'dark'];

	if (!BUILT_IN.includes(theme) && /^[a-z0-9-]+$/.test(theme)) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `themes/${theme}/${theme}.all.min.css?v=%BUILD%`;
		document.head.appendChild(link);
	}

	function toast(text) {
		const el = document.createElement('div');
		el.className = 'demo-toast';
		el.textContent = text;
		document.body.appendChild(el);
		setTimeout(() => el.remove(), 2500);
	}

	// Plugins from https://github.com/TimurSeyidov/jodit-plugins, latest 1.x.
	// jsDelivr lets browsers keep a file for 7 days; the date in the URL makes
	// them pick up a new release within a day. Loaded without blocking the
	// page; the editor is created once they are in (or failed).
	const PLUGINS = ['code', 'mailto', 'qrcode'];
	const day = new Date().toISOString().slice(0, 10);

	function loadScript(src) {
		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = src;
			script.onload = resolve;
			script.onerror = () => reject(new Error(`Cannot load ${src}`));
			document.head.appendChild(script);
		});
	}

	const pluginsReady = Promise.allSettled(
		PLUGINS.map(name =>
			loadScript(
				`https://cdn.jsdelivr.net/npm/jodit-plugin-${name}@1/dist/es2021/plugins/${name}/${name}.min.js?d=${day}`
			)
		)
	).then(results =>
		results
			.filter(result => result.status === 'rejected')
			.forEach(result => console.warn(result.reason.message))
	);

	DemoConnector.onFakeAction(action =>
		toast(`Demo mode: "${action}" is not saved on the server`)
	);

	/**
	 * Keep a custom theme on the Jodit PRO finder: its settings panel resets
	 * every theme except `default` and `dark` to `default` when it opens.
	 *
	 * @param {object} browser the file browser instance (`editor.filebrowser`)
	 * @param {string} name the theme to keep
	 */
	function keepTheme(browser, name) {
		const state = browser && browser.state;

		if (!state || typeof state.on !== 'function') {
			return;
		}

		// Restore after the current change event: a nested change would not
		// reach the finder's own listeners that update the theme classes
		state.on('change.theme', () => {
			if (state.theme !== name) {
				queueMicrotask(() => {
					state.theme = name;
				});
			}
		});
	}

	/**
	 * Create the demo editor.
	 *
	 * @param {object} [extra] options added to the shared ones (e.g. `license`)
	 * @returns {Promise<object>} the Jodit instance, once the plugins are loaded
	 */
	async function makeEditor(extra = {}) {
		await pluginsReady;

		const editor = Jodit.make('#editor', {
			theme,
			height: 560,
			toolbarAdaptive: false,
			// Also used by the file browser: Jodit passes it the editor uploader
			uploader: {
				url: DemoConnector.url,
				customUploadFunction: DemoConnector.upload
			},
			filebrowser: {
				theme,
				ajax: { url: DemoConnector.url, xhr: DemoConnector.xhr }
			},
			...extra
		});

		keepTheme(editor.filebrowser, theme);

		document.getElementById('browser').addEventListener('click', () => {
			editor.filebrowser.open(({ baseurl, files }) => {
				files.forEach(file => editor.s.insertImage(baseurl + file));
			});
		});

		window.editor = editor;
		return editor;
	}

	window.DemoEditor = { theme, make: makeEditor };
})();
