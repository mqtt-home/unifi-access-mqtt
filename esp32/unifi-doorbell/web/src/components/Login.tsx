import { useState } from 'preact/hooks'
import { BellIcon } from './Icons'
import { LangSwitch } from './Header'
import { useI18n } from '../lib/i18n'
import api from '../api/api'

interface LoginProps {
  onSuccess: () => void
}

export function Login({ onSuccess }: LoginProps) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.login(username, password)
      if (result.success) {
        onSuccess()
      } else {
        setError(t('login.invalid'))
      }
    } catch (err) {
      setError(t('login.failed', { e: (err as Error).message }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="login-container">
      <div class="login-lang"><LangSwitch /></div>
      <div class="card login-card">
        <div class="login-logo">
          <span class="ico lg"><BellIcon size={26} /></span>
          <h1>{t('login.title')}</h1>
          <p class="hint">{t('login.sub')}</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label for="login-username">{t('login.user')}</label>
            <input
              type="text"
              id="login-username"
              autoComplete="username"
              placeholder="admin"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              autoFocus
              required
            />
          </div>
          <div class="form-group">
            <label for="login-password">{t('login.pass')}</label>
            <input
              type="password"
              id="login-password"
              autoComplete="current-password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              required
            />
          </div>
          {error && <div class="note error">{error}</div>}
          <button type="submit" class="btn primary block" disabled={loading}>
            {loading ? <span class="spinner"></span> : t('login.submit')}
          </button>
        </form>
        <p class="hint center">{t('login.default')}</p>
      </div>
    </div>
  )
}
