// Demo connector: the file browsers read real files from the public Jodit
// demo connector, and every action that would change them is answered with
// a fake success instead of reaching the server.
//
// Plugged in through Jodit options only:
// - `filebrowser.ajax.xhr`: a factory of XMLHttpRequest objects (`DemoXHR`);
// - `uploader.customUploadFunction`: replaces the upload request (the editor
//   passes its uploader options to its file browser, so one hook covers both).

(function () {
	const CONNECTOR = 'https://xdsoft.net/jodit/finder/';

	// Actions that only read data go to the server as they are
	const READ_ACTIONS = ['files', 'folders', 'permissions', 'getLocalFileByUrl'];

	const listeners = [];

	function notify(action) {
		listeners.forEach(listener => listener(action));
	}

	function actionOf(url, body) {
		if (typeof FormData !== 'undefined' && body instanceof FormData) {
			return body.get('action');
		}

		if (typeof body === 'string' && body.includes('action=')) {
			return new URLSearchParams(body).get('action');
		}

		try {
			return new URL(url, location.href).searchParams.get('action');
		} catch {
			return null;
		}
	}

	function fakeAnswer(action) {
		return {
			success: true,
			time: new Date().toISOString(),
			data: {
				code: 220,
				files: [],
				isImages: [],
				path: '',
				baseurl: CONNECTOR + 'files/',
				messages: [`Demo: "${action}" is not saved`]
			}
		};
	}

	// XMLHttpRequest that answers write actions itself
	class DemoXHR extends XMLHttpRequest {
		open(method, url, ...rest) {
			this.demoUrl = url;
			return super.open(method, url, ...rest);
		}

		send(body) {
			const action = actionOf(this.demoUrl, body);

			if (!action || READ_ACTIONS.includes(action)) {
				return super.send(body);
			}

			const text = JSON.stringify(fakeAnswer(action));

			setTimeout(() => {
				Object.defineProperties(this, {
					readyState: { value: 4 },
					status: { value: 200 },
					statusText: { value: 'OK' },
					responseText: { value: text },
					response: { value: text }
				});

				this.onreadystatechange?.(new Event('readystatechange'));
				this.onload?.(new ProgressEvent('load'));
				this.dispatchEvent(new ProgressEvent('loadend'));
				notify(action);
			}, 150);
		}
	}

	function readAsDataUrl(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	// Replacement for the upload request (`uploader.customUploadFunction`).
	// Nothing reaches the server: images come back as data URLs, so the
	// editor still inserts them, and the file browsers just reload the list.
	async function fakeUpload(request, showProgress) {
		const files =
			typeof FormData !== 'undefined' && request instanceof FormData
				? [...request.values()].filter(value => value instanceof File)
				: [];
		const images = files.filter(file => file.type.startsWith('image/'));
		const urls = await Promise.all(images.map(readAsDataUrl));

		showProgress?.(100);
		notify('fileUpload');

		const answer = fakeAnswer('fileUpload');
		answer.data.baseurl = '';
		answer.data.files = urls;
		answer.data.isImages = urls.map(() => true);
		return answer;
	}

	window.DemoConnector = {
		url: CONNECTOR,
		xhr: () => new DemoXHR(),
		upload: fakeUpload,
		onFakeAction: listener => listeners.push(listener)
	};
})();
