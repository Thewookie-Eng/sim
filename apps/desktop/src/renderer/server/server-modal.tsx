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
  const requestInFlight = useRef(false)
  const [origin, setOrigin] = useState(configuration?.origin ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState(
    configuration && !addingAccount && configuration.origin !== configuration.defaultOrigin
      ? `This build defaults to ${configuration.defaultOrigin}`
      : ''
  )

  async function connect() {
    if (requestInFlight.current || !origin.trim()) return
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
        addingAccount ? 'The account could not be added.' : 'The server could not be changed.'
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
        <span id='server-title'>{addingAccount ? 'Add account' : 'Sim server'}</span>
      </ChipModalHeader>
      <ChipModalBody>
        <ChipModalDescription id='server-description'>
          {addingAccount
            ? 'Sign in to another account in its own window. Enter the server it lives on — the same one again, or a self-hosted deployment.'
            : 'Point this app at your own Sim deployment. Self-hosted servers must use HTTPS; localhost may use HTTP.'}
        </ChipModalDescription>
        <ChipModalField
          type='input'
          inputType='url'
          title='Server URL'
          value={origin}
          onChange={(value) => {
            setOrigin(value)
            setError(undefined)
            setMessage('')
          }}
          autoComplete='off'
          placeholder='https://sim.example.com'
          disabled={pending}
          error={error}
          hint={<span role='status'>{pending ? 'Connecting…' : message}</span>}
        />
      </ChipModalBody>
      <ChipModalFooter
        onCancel={closeWindow}
        primaryAction={{
          label: pending ? 'Connecting…' : 'Connect',
          onClick: connect,
          disabled: pending || !origin.trim(),
        }}
      />
    </ChipModalSurface>
  )
}
