import { close as closeCallback, fstat as fstatCallback, open as openCallback } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { DesktopLocalFileRead } from '@sim/desktop-bridge'

const open = promisify(openCallback)
const close = promisify(closeCallback)
const fstat = (descriptor: number) => promisify(fstatCallback)(descriptor, { bigint: true })

type EntryKind = NonNullable<DesktopLocalFileRead['entries']>[number]['kind']

/** Where each open descriptor points; Windows cannot enumerate a directory by handle. */
const openedPaths = new Map<number, string>()

async function sameObject(descriptor: number, path: string): Promise<boolean> {
  const [opened, current] = await Promise.all([fstat(descriptor), lstat(path, { bigint: true })])
  return !current.isSymbolicLink() && opened.dev === current.dev && opened.ino === current.ino
}

async function openChecked(path: string): Promise<number> {
  const descriptor = await open(path, 'r')
  try {
    if (!(await sameObject(descriptor, path))) throw new Error('changed')
    return descriptor
  } catch (error) {
    await close(descriptor)
    throw error
  }
}

/**
 * The Windows counterpart of `native/directory.cc`. Each component is opened
 * by name and then proven, by volume serial and file index, to be the
 * non-link object the name pointed to, so a junction, symlink, or swap planted
 * after approval cannot redirect the open outside the granted folder.
 */
export async function openApproved(
  root: string,
  relativePath: string,
  dev: bigint,
  ino: bigint,
  directory: boolean
): Promise<number> {
  let descriptor: number
  try {
    descriptor = await openChecked(root)
    const metadata = await fstat(descriptor)
    if (!metadata.isDirectory() || metadata.dev !== dev || metadata.ino !== ino) {
      await close(descriptor)
      throw new Error('changed')
    }
  } catch {
    throw new Error('The approved folder changed. Request access again.')
  }
  const components = relativePath === '' ? [] : relativePath.split(/[\\/]/)
  let current = root
  for (const [index, component] of components.entries()) {
    // A colon names an alternate data stream, which is not a file the user approved.
    if (component === '' || component === '.' || component === '..' || component.includes(':')) {
      await close(descriptor)
      throw new Error('The path must stay within the approved folder.')
    }
    current = join(current, component)
    let next: number
    try {
      next = await openChecked(current)
    } catch {
      await close(descriptor)
      throw new Error('Could not open the path within the approved folder.')
    }
    await close(descriptor)
    descriptor = next
    const last = index === components.length - 1
    if (!last && !(await fstat(descriptor)).isDirectory()) {
      await close(descriptor)
      throw new Error('Could not open the path within the approved folder.')
    }
  }
  const metadata = await fstat(descriptor)
  if (directory ? !metadata.isDirectory() : !metadata.isFile()) {
    await close(descriptor)
    throw new Error('The approved path is not a regular file or directory.')
  }
  openedPaths.set(descriptor, current)
  return descriptor
}

export async function readDirectory(descriptor: number, limit: number) {
  const path = openedPaths.get(descriptor)
  if (!path) throw new Error('Could not retain the approved directory descriptor.')
  const dirents = await readdir(path, { withFileTypes: true }).catch(() => {
    throw new Error('Could not enumerate the approved directory.')
  })
  if (!(await sameObject(descriptor, path).catch(() => false))) {
    throw new Error('Could not finish reading the approved directory.')
  }
  const entries = dirents.slice(0, limit).map((entry) => {
    const kind: EntryKind = entry.isSymbolicLink()
      ? 'symlink'
      : entry.isDirectory()
        ? 'directory'
        : entry.isFile()
          ? 'file'
          : 'other'
    return { name: entry.name, kind }
  })
  return { entries, truncated: dirents.length > limit }
}

export async function closeFile(descriptor: number): Promise<void> {
  openedPaths.delete(descriptor)
  await close(descriptor)
}
