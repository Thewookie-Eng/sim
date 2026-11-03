/**
 * Local Network Access: Chromium's permission for a page to reach services on
 * this device or its network — loopback included.
 *
 * Sign-in tools depend on it. Okta FastPass, for one, has the sign-in page talk
 * to Okta Verify listening on 127.0.0.1; without the permission the page says
 * "the browser is blocking communication with Okta Verify" and sign-in stops.
 * Electron's types predate the permission, so it reaches the session handlers
 * under names they did not know and was denied with everything else unknown.
 *
 * It is not granted silently. A page that can reach this machine's loopback
 * can probe whatever else listens there, so each site is allowed only after
 * the user says so in a native prompt — one the page, and the agent driving
 * the built-in browser, cannot click — and only Allow is remembered.
 */
import { createLogger } from '@sim/logger'
import { isLoopbackHostname } from '@sim/security/ssrf'
import { getErrorMessage } from '@sim/utils/errors'
import type { WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import type { ConfigStore } from '@/main/config'
import { showShellDialog } from '@/main/dialogs'

const logger = createLogger('DesktopLocalNetworkAccess')

/** The names Chromium uses: the umbrella permission and its newer split. */
const LOCAL_NETWORK_PERMISSIONS: ReadonlySet<string> = new Set([
  'local-network-access',
  'local-network',
  'loopback-network',
])

export function isLocalNetworkPermission(permission: string): boolean {
  return LOCAL_NETWORK_PERMISSIONS.has(permission)
}

let config: ConfigStore | null = null
/** A refusal holds until restart, so a page that retries cannot nag. */
const deniedThisSession = new Set<string>()
/** One prompt per site at a time, however many frames ask at once. */
const pendingPrompts = new Map<string, Promise<boolean>>()

export function initLocalNetworkAccess(store: ConfigStore): void {
  config = store
}

/** The origin a decision is stored under; null for anything not https or local http. */
function grantableOrigin(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:') return url.origin
    if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) return url.origin
    return null
  } catch {
    return null
  }
}

function allowedOrigins(): string[] {
  const stored = config?.get('localNetworkAccessOrigins')
  return Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : []
}

/** Whether the site was allowed before; what the permission check answers. */
export function hasLocalNetworkAccess(rawOrigin: string | undefined): boolean {
  const origin = grantableOrigin(rawOrigin)
  return origin !== null && allowedOrigins().includes(origin)
}

async function promptForAccess(origin: string, contents: WebContents | null): Promise<boolean> {
  const host = new URL(origin).host
  const owner = contents && !contents.isDestroyed() ? BrowserWindow.fromWebContents(contents) : null
  const parent = owner ?? BrowserWindow.getFocusedWindow()
  const options = {
    type: 'question' as const,
    title: 'Allow access to apps on this device?',
    message: `Allow ${host} to connect to apps on this device?`,
    detail:
      'Sign-in tools such as Okta FastPass use this to reach Okta Verify running on your computer. Allow it only for sites you trust.',
    buttons: ['Allow', 'Don’t Allow'],
    defaultId: 0,
    cancelId: 1,
  }
  try {
    const { response } =
      parent && !parent.isDestroyed()
        ? await showShellDialog(parent, options)
        : await showShellDialog(options)
    return response === 0
  } catch (error) {
    logger.warn('Could not show the local network access prompt', {
      error: getErrorMessage(error),
    })
    return false
  }
}

/**
 * Grants a site Local Network Access, asking the user the first time.
 * `reloadOnGrant` is for a page that only queried the permission: it has
 * already failed, so it is reloaded to retry with the grant in place.
 */
export function requestLocalNetworkAccess(
  rawOrigin: string | undefined,
  contents: WebContents | null,
  options: { reloadOnGrant?: boolean } = {}
): Promise<boolean> {
  const origin = grantableOrigin(rawOrigin)
  if (!origin || !config) return Promise.resolve(false)
  if (allowedOrigins().includes(origin)) return Promise.resolve(true)
  if (deniedThisSession.has(origin)) return Promise.resolve(false)

  const inFlight = pendingPrompts.get(origin)
  if (inFlight) return inFlight

  const pending = promptForAccess(origin, contents)
    .then((allowed) => {
      if (!allowed) {
        deniedThisSession.add(origin)
        logger.info('Local network access refused', { origin })
        return false
      }
      config?.set('localNetworkAccessOrigins', [...allowedOrigins(), origin])
      config?.flush()
      logger.info('Local network access allowed', { origin })
      if (options.reloadOnGrant && contents && !contents.isDestroyed()) contents.reload()
      return true
    })
    .finally(() => {
      pendingPrompts.delete(origin)
    })
  pendingPrompts.set(origin, pending)
  return pending
}

/**
 * What a permission *check* answers. Chromium may consult the check before it
 * ever requests, and a `false` there reads as a settled denial — so an
 * undecided site gets the prompt from here too, and a reload once allowed.
 */
export function checkLocalNetworkAccess(
  rawOrigin: string | undefined,
  contents: WebContents | null
): boolean {
  if (hasLocalNetworkAccess(rawOrigin)) return true
  void requestLocalNetworkAccess(rawOrigin, contents, { reloadOnGrant: true })
  return false
}
