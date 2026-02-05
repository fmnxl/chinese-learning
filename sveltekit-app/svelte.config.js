import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',  // SPA fallback for client-side routing
			precompress: true
		}),
		prerender: {
			handleHttpError: 'warn',
			handleMissingId: 'warn'
		}
	}
};

export default config;
