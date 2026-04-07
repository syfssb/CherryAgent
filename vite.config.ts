import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const port = Number.parseInt(env.PORT || '', 10) || 5173; // MUST BE LOWERCASE
	const host = env.HOST || '127.0.0.1';

	return {
		plugins: [
			react({
				babel: {
					plugins: ['babel-plugin-react-compiler'],
				},
			}),
			tailwindcss(),
			tsconfigPaths({
				projects: [
					'./tsconfig.json',
					'./tsconfig.app.json',
					'./tsconfig.node.json',
					'./src/electron/tsconfig.json',
				],
			}),
		],
		base: './',
		build: {
			target: 'chrome136',
			outDir: 'dist-react',
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (id.includes('node_modules')) {
							if (id.includes('@clerk/clerk-js') || id.includes('@clerk/')) return 'vendor-clerk';
							if (id.includes('highlight.js')) return 'vendor-highlight';
							if (id.includes('react-markdown') || id.includes('remark-gfm') ||
								id.includes('rehype-raw') || id.includes('rehype-highlight') ||
								id.includes('unified') || id.includes('hast-') || id.includes('mdast-') ||
								id.includes('micromark') || id.includes('unist-')) return 'vendor-markdown';
							if (id.includes('@radix-ui')) return 'vendor-ui';
							if (id.includes('zustand') || id.includes('i18next') ||
								id.includes('react-i18next')) return 'vendor-state';
							if (id.includes('driver.js')) return 'vendor-onboarding';
							if (id.includes('lucide-react')) return 'vendor-icons';
						}
					},
				},
			},
		},
		resolve: {
			alias: {
				react: path.resolve(__dirname, 'node_modules/react'),
				'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
				'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
				'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
				'@specs': path.resolve(__dirname, '../specs'),
				'@version-a': path.resolve(__dirname, '../specs/001-saas-monetization/designs/version-a-neo-tech'),
				'@version-b': path.resolve(__dirname, '../specs/001-saas-monetization/designs/version-b-warm-craft'),
				'@version-c': path.resolve(__dirname, '../specs/001-saas-monetization/designs/version-c-dev-studio'),
			},
			dedupe: ['react', 'react-dom', 'react-i18next'],
		},
		server: {
			port, // MUST BE LOWERCASE
			strictPort: true,
			host,
			watch: {
				ignored: [
					'**/dist-installer/**',
					'**/dist-installer.bad.*/**',
					'**/dist-installer.bad.*',
				],
			},
		},
	};
});
