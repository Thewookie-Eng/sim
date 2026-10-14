/**
 * Accounts: the identities the shell is signed in as, each a Sim server origin
 * plus its own cookie jar. Several can be live at once, each in its own
 * windows — a sim.ai login next to a self-hosted one, or two logins on the
 * same server.
 *
 * The first account is special only for compatibility: it is the one every
 * install already had, described by the `origin` setting and living in the
 * partition {@link partitionForOrigin} chose for it. Keeping that mapping is
 * what lets an update to this build leave existing users signed in.
 */
import { type Account, PRIMARY_ACCOUNT_ID, partitionForOrigin } from '@/main/config'

/** Who the account's jar is signed in as, read from the server's session. */
export interface AccountIdentity {
  userId: string
  name: string | null
  email: string | null
}

/**
 * The cookie/storage partition an account lives in. The primary account keeps
 * the per-origin partition it always had; every other account gets a jar keyed
 * by its id, so two logins on one origin never share a session.
 */
export function partitionForAccount(account: Account): string {
  if (account.id === PRIMARY_ACCOUNT_ID) return partitionForOrigin(account.origin)
  return `persist:sim-account-${encodeURIComponent(account.id)}`
}

/** The server, as people say it: `sim.ai`, not `www.sim.ai`. */
export function accountHost(account: Account): string {
  try {
    return new URL(account.origin).host.replace(/^www\./, '')
  } catch {
    return account.origin
  }
}

/**
 * What menus and window titles call an account: the user's own name for it,
 * else who it is signed in as, else only the server.
 */
export function accountDisplayName(account: Account, identity?: AccountIdentity | null): string {
  const label = account.label?.trim()
  if (label) return label
  const name = identity?.name?.trim()
  if (name) return name
  const email = identity?.email?.trim()
  if (email) return email
  return accountHost(account)
}

/** `Ada (sim.ai)`; just `sim.ai` while nobody is signed in and it has no name. */
export function accountMenuLabel(account: Account, identity?: AccountIdentity | null): string {
  const name = accountDisplayName(account, identity)
  const host = accountHost(account)
  return name === host ? host : `${name} (${host})`
}
