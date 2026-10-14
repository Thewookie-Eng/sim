import { useRef, useState } from 'react'
import type { DesktopServerConfiguration } from '@sim/desktop-bridge'
import {
  ChipModalBody,
  ChipModalDescription,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipModalSurface,
} from '@sim/emcn'
import { mountShellModal } from '@/renderer/shell'
import type { ShellWindowApi } from '@/shared/shell'

interface ServerModalProps {
  server: ShellWindowApi['server']
  configuration?: DesktopServerConfiguration
  initialError?: string
}

function closeWindow() {
  window.close()
}

function mountServerModal(element: HTMLDivElement | null) {
  return mountShellModal(element, closeWindow)
}

export function ServerModal({ server, configuration, initialError }: ServerModalProps) {
  const addingAccount = configuration?.purpose === 'add-account'
  const renaming = configuration?.purpose === 'rename-account'
  const requestInFlight = useRef(false)
  const [origin, setOrigin] = useState(
    renaming ? (configuration?.label ?? '') : (configuration?.origin ?? '')
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState(
    configuration && !addingAccount && configuration.origin !== configuration.defaultOrigin
      ? `This build defaults to ${configuration.defaultOrigin}`
      : ''
  )

  async function connect() {
    // A blank name is a valid rename: it goes back to the signed-in user's name.
    if (requestInFlight.current || (!renaming && !origin.trim())) return
    requestInFlight.current = true
    setPending(true)
    setError(undefined)
    setMessage('')
    try {
      const result = await server.setOrigin(origin)
      if (!result.ok) {
        setError(result.error)
      } else if (result.unchanged) {
        setMessage('Already connected to this server.')
      }
    } catch {
      setError(
        renaming
          ? 'The account could not be renamed.'
          : addingAccount
            ? 'The account could not be added.'
            : 'The server could not be changed.'
      )
    } finally {
      requestInFlight.current = false
      setPending(false)
    }
  }

  return (
    <ChipModalSurface
      ref={mountServerModal}
      role='dialog'
      aria-modal='true'
      aria-labelledby='server-title'
      aria-describedby='server-description'
      className='max-h-screen'
    >
      <ChipModalHeader
        onClose={closeWindow}
        className='[-webkit-app-region:drag] [&_button]:[-webkit-app-region:no-drag]'
      >
        <span id='server-title'>
          {renaming ? 'Rename account' : addingAccount ? 'Add account' : 'Sim server'}
        </span>
      </ChipModalHeader>
      <ChipModalBody>
        <ChipModalDescription id='server-description'>
          {renaming
            ? 'The name shown in the Accounts menu and window titles. Leave it blank to use the signed-in user’s name.'
            : addingAccount
              ? 'Sign in to another account in its own window. Enter the server it lives on — the same one again, or a self-hosted deployment.'
              : 'Point this app at your own Sim deployment. Self-hosted servers must use HTTPS; localhost may use HTTP.'}
        </ChipModalDescription>
        <ChipModalField
          type='input'
          inputType={renaming ? 'text' : 'url'}
          title={renaming ? 'Name' : 'Server URL'}
          value={origin}
          onChange={(value) => {
            setOrigin(value)
            setError(undefined)
            setMessage('')
          }}
          autoComplete='off'
          placeholder={renaming ? 'Work' : 'https://sim.example.com'}
          disabled={pending}
          error={error}
          hint={
            <span role='status'>{pending ? (renaming ? 'Saving…' : 'Connecting…') : message}</span>
          }
        />
      </ChipModalBody>
      <ChipModalFooter
        onCancel={closeWindow}
        primaryAction={{
          label: renaming ? (pending ? 'Saving…' : 'Save') : pending ? 'Connecting…' : 'Connect',
          onClick: connect,
          disabled: pending || (!renaming && !origin.trim()),
        }}
      />
    </ChipModalSurface>
  )
}
