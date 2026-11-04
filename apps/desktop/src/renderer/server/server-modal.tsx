import { useRef, useState } from 'react'
import { AuthButton, AuthField, AuthHeader, AuthInput, AuthRoot, AuthStack } from '@sim/auth-ui'
import type { DesktopServerConfiguration } from '@sim/desktop-bridge'
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
  if (!element) return
  element.querySelector<HTMLInputElement>('input')?.focus()
  const host = (window as Window & { simShell?: ShellWindowApi }).simShell
  const resize = () => host?.resizeContent(Math.ceil(element.scrollHeight))
  const observer = new ResizeObserver(resize)
  observer.observe(element)
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeWindow()
    }
  }
  document.addEventListener('keydown', onKey)
  resize()
  return () => {
    observer.disconnect()
    document.removeEventListener('keydown', onKey)
  }
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
    <AuthRoot>
      <div
        ref={mountServerModal}
        role='dialog'
        aria-modal='true'
        aria-label={renaming ? 'Rename account' : addingAccount ? 'Add account' : 'Sim server'}
        className='au:p-6'
      >
        <AuthStack>
          <div className='au:[-webkit-app-region:drag]'>
            <AuthHeader
              title={renaming ? 'Rename account' : addingAccount ? 'Add account' : 'Sim server'}
              description={
                renaming
                  ? 'The name shown in the Accounts menu and window titles. Leave it blank to use the signed-in email.'
                  : addingAccount
                    ? 'Sign in to another account in its own window, on sim.ai or a self-hosted deployment.'
                    : 'Connect to your organization’s Sim deployment.'
              }
            />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void connect()
            }}
            className='au:space-y-5'
          >
            <AuthField
              htmlFor='server-origin'
              label={renaming ? 'Name' : 'Server URL'}
              errors={error ? [error] : undefined}
              hint={
                <>
                  {!renaming && (
                    <span>Use HTTPS for self-hosted servers. Localhost may use HTTP.</span>
                  )}
                  <span role='status'>{message && ` ${message}`}</span>
                </>
              }
            >
              <AuthInput
                id='server-origin'
                type={renaming ? 'text' : 'url'}
                value={origin}
                onChange={(event) => {
                  setOrigin(event.target.value)
                  setError(undefined)
                  setMessage('')
                }}
                autoComplete='off'
                placeholder={renaming ? 'Work' : 'https://sim.example.com'}
                disabled={pending}
                error={Boolean(error)}
                aria-describedby='server-origin-hint'
              />
            </AuthField>
            <div className='au:grid au:grid-cols-2 au:gap-2'>
              <AuthButton onClick={closeWindow} fullWidth>
                Cancel
              </AuthButton>
              <AuthButton
                type='submit'
                variant='primary'
                disabled={!renaming && !origin.trim()}
                loading={pending}
                loadingLabel={renaming ? 'Saving…' : 'Connecting…'}
                fullWidth
              >
                {renaming ? 'Save' : 'Connect'}
              </AuthButton>
            </div>
          </form>
        </AuthStack>
      </div>
    </AuthRoot>
  )
}
