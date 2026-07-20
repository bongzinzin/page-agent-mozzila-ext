import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, readFileSync } from 'node:fs'
import { defineConfig } from 'wxt'

const chromeProfile = '.wxt/chrome-data'
mkdirSync(chromeProfile, { recursive: true })

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// ponytail: detect target browser from CLI args for top-level config (webExt)
const isFirefox = process.argv.includes('-b firefox') || process.argv.includes('--browser firefox')

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: 'src',
	modules: ['@wxt-dev/module-react'],
	...(isFirefox
		? {}
		: {
				webExt: {
					chromiumProfile: chromeProfile,
					keepProfileChanges: true,
					chromiumArgs: ['--hide-crash-restore-bubble'],
				},
			}),
	vite: () => ({
		plugins: [tailwindcss()],
		define: {
			__VERSION__: JSON.stringify(pkg.version),
		},
		optimizeDeps: {
			force: true,
		},
		build: {
			minify: false,
			chunkSizeWarningLimit: 2000,
			cssCodeSplit: true,
			rollupOptions: {
				onwarn: function (message, handler) {
					if (message.code === 'EVAL') return
					handler(message)
				},
			},
		},
	}),
	zip: {
		artifactTemplate: 'page-agent-ext-{{version}}-{{browser}}.zip',
	},
	suppressWarnings: {
		firefoxDataCollection: true,
	},
	// manifest as function — receives { browser } from WXT
	manifest: ({ browser }) => ({
		key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqbzT0iTYeYlnCvDJIGDnGU8oarJgZILDzSfLi/ufuSxXEPDKuMyD892GhvrMCZNVHS11Sh6NYUOc/PcUOhtaR2urHtcNkrpSJNV10zUamY7fxBdVEkOucfyLu8INVy+teis62MoRWYPaUPkfZUjrLGW8MsZ9aFzARfu9GGDEp2EAYsWDN6w6vyz9LJ82pm542EWnVT4MjmDPgvYFCWGBtaU/dfHD+GAX6URJFapsCvryVURKJ+76c/GO9/I3EX1IBfbY6dec78bLCMvVxiTmiv36KyGPwX1OpakW8IiCpXWdbAxjm+plbYlp5t5zTyyoE3sOSFeXsBH0Kg27o8GcvQIDAQAB',
		default_locale: 'en',
		name: '__MSG_extName__',
		description: '__MSG_extDescription__',
		homepage_url: 'https://alibaba.github.io/page-agent/',
		permissions:
			browser === 'firefox'
				? ['tabs', 'storage', '<all_urls>'] // ponytail: Firefox MV2 uses permissions for host patterns
				: ['tabs', 'tabGroups', 'sidePanel', 'storage'],
		host_permissions: browser === 'chrome' ? ['<all_urls>'] : undefined,
		icons: {
			64: 'assets/page-agent-64.png',
		},
		action: {
			default_title: '__MSG_extActionTitle__',
		},
		web_accessible_resources:
			browser === 'firefox'
				? ['main-world.js']
				: [{ resources: ['main-world.js'], matches: ['*://*/*'] }],
		...(browser === 'chrome' && {
			side_panel: {
				default_path: 'sidepanel/index.html',
			},
			externally_connectable: {
				matches: ['http://localhost/*'],
			},
		}),
		// Firefox: keyboard shortcut to open hub tab (Ctrl+Alt+Z)
		...(browser === 'firefox' && {
			commands: {
				'open-hub': {
					suggested_key: {
						default: 'Ctrl+Alt+Z',
					},
					description: 'Open Page Agent',
				},
			},
		}),
	}),
})
