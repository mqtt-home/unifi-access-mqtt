import { useState } from 'preact/hooks'
import { BellIcon } from './Icons'
import { LangSwitch } from './Header'
import { useI18n } from '../lib/i18n'
import api from '../api/api'

export function ApSetup() {
  const { t } = useI18n()
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [finalMessage, setFinalMessage] = useState<{ ip?: string } | null>(null)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!ssid.trim()) {
      setError(t('ap.ssidMissing'))
      return
    }

    setLoading(true)

    try {
      await api.testWifi(ssid, password)

      // Poll for connection status
      let testResult = null
      for (let i = 0; i < 35; i++) {
        await new Promise(resolve => setTimeout(resolve, 500))
        const status = await api.getWifiStatus()

        if (status.status === 'success') {
          testResult = status
          break
        } else if (status.status === 'failed') {
          testResult = status
          break
        }
      }

      if (!testResult) {
        testResult = { success: false, message: t('ap.timeout') }
      }

      if (!testResult.success) {
        setError(testResult.message ?? t('ap.failed'))
        setLoading(false)
        return
      }

      setSuccess(t('ap.ok', { ip: testResult.ip ?? t('ap.assigned') }))
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Save and reboot
      api.setupWifi(ssid, password).catch(() => {})

      setTimeout(() => {
        setFinalMessage({ ip: testResult.ip })
      }, 2000)

    } catch (err) {
      setError(t('error', { e: (err as Error).message }))
      setLoading(false)
    }
  }

  const logo = (
    <div class="login-logo">
      <span class="ico lg"><BellIcon size={26} /></span>
      <h1>{t('ap.title')}</h1>
      <p class="hint">{t('ap.sub')}</p>
    </div>
  )

  if (finalMessage) {
    return (
      <div class="login-container">
        <div class="card login-card">
          {logo}
          <div class="note ok col">
            <div>{t('ap.rebooting')}</div>
            <div>{t('ap.openAfter')}</div>
            <a href="http://doorbell.local">doorbell.local</a>
            {finalMessage.ip && <a href={`http://${finalMessage.ip}`}>{finalMessage.ip}</a>}
          </div>
          <button type="button" class="btn primary block" onClick={() => location.reload()}>{t('ap.reload')}</button>
        </div>
      </div>
    )
  }

  return (
    <div class="login-container">
      <div class="login-lang"><LangSwitch /></div>
      <div class="card login-card">
        {logo}
        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label for="ap-wifi-ssid">{t('ap.ssid')}</label>
            <input
              type="text"
              id="ap-wifi-ssid"
              placeholder={t('ap.ssidPh')}
              value={ssid}
              onInput={(e) => setSsid((e.target as HTMLInputElement).value)}
              autoFocus
              required
            />
          </div>
          <div class="form-group">
            <label for="ap-wifi-password">{t('ap.pass')}</label>
            <input
              type="password"
              id="ap-wifi-password"
              placeholder={t('ap.passPh')}
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            />
          </div>
          {error && <div class="note error">{error}</div>}
          {success && <div class="note ok">{success}</div>}
          <button type="submit" class="btn primary block" disabled={loading}>
            {loading ? <><span class="spinner"></span> {t('ap.testing')}</> : t('ap.connect')}
          </button>
        </form>
        <p class="hint center">{t('ap.after')} <strong>http://doorbell.local</strong></p>
      </div>
    </div>
  )
}
