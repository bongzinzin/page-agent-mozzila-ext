/**
 * content script for RemotePageController
 */
import { PageController } from '@page-agent/page-controller'
import { browser } from '@wxt-dev/browser'

export function initPageController() {
	let pageController: PageController | null = null
	let intervalID: number | null = null
	let monitoring = false

	const myTabIdPromise = browser.runtime
		.sendMessage({ type: 'PAGE_CONTROL', action: 'get_my_tab_id' })
		.then((response) => {
			return (response as { tabId: number | null }).tabId
		})
		.catch((error) => {
			console.error('[RemotePageController.ContentScript]: Failed to get my tab id', error)
			return null
		})

	function getPC(): PageController {
		if (!pageController) {
			pageController = new PageController({
				enableMask: false,
				viewportExpansion: 400,
			})
		}
		return pageController
	}

	function startMonitoring() {
		if (monitoring) return
		monitoring = true

		intervalID = window.setInterval(async () => {
			const data = await browser.storage.local.get([
				'agentHeartbeat',
				'isAgentRunning',
				'currentTabId',
			])
			const agentHeartbeat = data.agentHeartbeat
			const now = Date.now()
			const agentInTouch = typeof agentHeartbeat === 'number' && now - agentHeartbeat < 2_000

			const isAgentRunning = data.isAgentRunning
			const currentTabId = data.currentTabId

			const shouldShowMask =
				isAgentRunning && agentInTouch && currentTabId === (await myTabIdPromise)

			if (shouldShowMask) {
				const pc = getPC()
				pc.initMask()
				await pc.showMask()
			} else {
				// await getPC().hideMask()
				if (pageController) {
					await pageController.hideMask()
					await pageController.cleanUpHighlights()
				}
			}

			if (!isAgentRunning && agentInTouch) {
				if (pageController) {
					pageController.dispose()
					pageController = null
				}
			}
		}, 500)
	}

	async function stopMonitoring() {
		monitoring = false
		if (intervalID != null) {
			clearInterval(intervalID)
			intervalID = null
		}
		if (pageController) {
			await pageController.hideMask()
			await pageController.cleanUpHighlights()
		}
	}

	browser.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type !== 'PAGE_CONTROL') {
			return
		}

		const { action, payload } = message

		// Monitoring control messages
		if (action === 'start_monitoring') {
			startMonitoring()
			sendResponse({ success: true })
			return true
		}
		if (action === 'stop_monitoring') {
			stopMonitoring()
			sendResponse({ success: true })
			return true
		}

		// DOM interaction actions — activate monitoring lazily
		const domActions = [
			'get_browser_state',
			'update_tree',
			'click_element',
			'input_text',
			'select_option',
			'scroll',
			'scroll_horizontally',
		]
		if (domActions.includes(action)) {
			startMonitoring()
		}

		const methodName = getMethodName(action)
		const pc = getPC() as any

		switch (action) {
			case 'get_last_update_time':
			case 'get_browser_state':
			case 'update_tree':
			case 'clean_up_highlights':
			case 'click_element':
			case 'input_text':
			case 'select_option':
			case 'scroll':
			case 'scroll_horizontally':
				pc[methodName](...(payload || []))
					.then((result: any) => sendResponse(result))
					.catch((error: any) =>
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : String(error),
						})
					)
				break

			case 'execute_javascript':
				sendResponse({
					success: false,
					error:
						'execute_javascript is not supported in extension content scripts (CSP restriction).',
				})
				break

			default:
				sendResponse({
					success: false,
					error: `Unknown PAGE_CONTROL action: ${action}`,
				})
		}

		return true
	})
}

function getMethodName(action: string): string {
	switch (action) {
		case 'get_last_update_time':
			return 'getLastUpdateTime' as const
		case 'get_browser_state':
			return 'getBrowserState' as const
		case 'update_tree':
			return 'updateTree' as const
		case 'clean_up_highlights':
			return 'cleanUpHighlights' as const

		// DOM actions

		case 'click_element':
			return 'clickElement' as const
		case 'input_text':
			return 'inputText' as const
		case 'select_option':
			return 'selectOption' as const
		case 'scroll':
			return 'scroll' as const
		case 'scroll_horizontally':
			return 'scrollHorizontally' as const
		case 'execute_javascript':
			return 'executeJavascript' as const

		default:
			return action
	}
}
