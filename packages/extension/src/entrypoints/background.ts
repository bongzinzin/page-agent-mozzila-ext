import { handlePageControlMessage } from '@/agent/RemotePageController.background'
import { handleTabControlMessage } from '@/agent/TabsController.background'

export default defineBackground(() => {
	console.log('[Background] Service Worker started')

	// generate user auth token

	browser.storage.local.get('PageAgentExtUserAuthToken').then((result) => {
		if (result.PageAgentExtUserAuthToken) return

		const userAuthToken = crypto.randomUUID()
		browser.storage.local.set({ PageAgentExtUserAuthToken: userAuthToken })
	})

	// message proxy

	browser.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type === 'TAB_CONTROL') {
			return handleTabControlMessage(message, sender, sendResponse)
		} else if (message.type === 'PAGE_CONTROL') {
			return handlePageControlMessage(message, sender, sendResponse)
		} else {
			sendResponse({ error: 'Unknown message type' })
			return
		}
	})

	// external messages (from localhost launcher page via externally_connectable)
	// ponytail: guarded — onMessageExternal may drop from Firefox compat shim in future MV3

	if (import.meta.env.BROWSER === 'chrome') {
		browser.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
			if (message.type === 'OPEN_HUB') {
				openOrFocusHubTab(message.wsPort).then(() => {
					if (sender.tab?.id) browser.tabs.remove(sender.tab.id)
					sendResponse({ ok: true })
				})
				return true
			}
		})
	}

	// setup

	if (import.meta.env.BROWSER === 'chrome') {
		browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
	} else {
		// Firefox: no sidePanel API — browser action opens hub tab instead
		// ponytail: MV2 uses browserAction, MV3/Chrome uses action
		const actionApi = (browser as any).browserAction ?? browser.action
		actionApi.onClicked.addListener(() => {
			browser.tabs.create({ url: browser.runtime.getURL('sidepanel.html') })
		})
		// Firefox: keyboard shortcut via commands API
		browser.commands.onCommand.addListener((command) => {
			if (command === 'open-hub') {
				browser.tabs.create({ url: browser.runtime.getURL('sidepanel.html') })
			}
		})
	}
})

async function openOrFocusHubTab(wsPort: number) {
	const hubUrl = browser.runtime.getURL('hub.html')
	const existing = await browser.tabs.query({ url: `${hubUrl}*` })

	if (existing.length > 0 && existing[0].id) {
		await browser.tabs.update(existing[0].id, {
			active: true,
			url: `${hubUrl}?ws=${wsPort}`,
		})
		return
	}

	await browser.tabs.create({ url: `${hubUrl}?ws=${wsPort}`, pinned: true })
}
