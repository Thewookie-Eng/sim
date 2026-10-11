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

/**
 * The cookie/storage partition an account lives in. The primary account keeps
 * the per-origin partition it always had; every other account gets a jar keyed
 * by its id, so two logins on one origin never share a session.
 */
export function partitionForAccount(account: Account): string {
  if (account.id === PRIMARY_ACCOUNT_ID) return partitionForOrigin(account.origin)
  return `persist:sim-account-${encodeURIComponent(account.id)}`
}

/** The host alone; what disambiguates two accounts that share a label. */
export function accountHost(account: Account): string {
  try {
    return new URL(account.origin).host
  } catch {
    return account.origin
  }
}

/** What menus and window titles call an account. */
export function accountDisplayName(account: Account): string {
  const label = account.label?.trim()
  return label || accountHost(account)
}
