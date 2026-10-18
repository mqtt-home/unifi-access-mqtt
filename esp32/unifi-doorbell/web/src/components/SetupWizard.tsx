import { useState, useEffect } from 'preact/hooks'
import type { Config, TopologyDevice } from '../types'
import { CheckIcon } from './Icons'
import api from '../api/api'
import { useI18n } from '../lib/i18n'

interface SetupWizardProps {
  config: Config
}

export function SetupWizard({ config }: SetupWizardProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(1)
  const [host, setHost] = useState(config.unifi?.host ?? '')
  const [port, setPort] = useState<number>(config.unifi?.port ?? 12445)
  const [username, setUsername] = useState(config.unifi?.username ?? '')
  const [password, setPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [hasExistingPassword, setHasExistingPassword] = useState(false)
  const [hasExistingToken, setHasExistingToken] = useState(false)
  const [certificate, setCertificate] = useState('')
  const [certStatus, setCertStatus] = useState<{ type: string; message: string } | null>(null)
  const [fetchingCert, setFetchingCert] = useState(false)
  const [readers, setReaders] = useState<TopologyDevice[]>([])
  const [loadingReaders, setLoadingReaders] = useState(false)
  const [readersError, setReadersError] = useState('')
  const [selectedReader, setSelectedReader] = useState(config.doorbell?.deviceId ?? '')
  const [manualReaderId, setManualReaderId] = useState('')
  const [deviceName, setDeviceName] = useState(config.doorbell?.deviceName ?? '')
  const [doorName, setDoorName] = useState(config.doorbell?.doorName ?? '')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ type: string; message: string } | null>(null)
  const [testRingStatus, setTestRingStatus] = useState<{ type: string; message: string } | null>(null)
  const [testingRing, setTestingRing] = useState(false)
  const [loginCheck, setLoginCheck] = useState<{ ok: boolean; message: string } | null>(null)
  const [tokenCheck, setTokenCheck] = useState<{ ok: boolean; message: string } | null>(null)

  // True when a returning user has legacy creds saved but no API token yet —
  // i.e. they need to add the token to enable trigger via the official API.
  const needsTokenUpgrade = !!config.unifi?.host
    && !!config.unifi?.username
    && config.unifi?.apiTokenSet === false

  useEffect(() => {
    setHost(config.unifi?.host ?? '')
    setPort(config.unifi?.port ?? 12445)
    setUsername(config.unifi?.username ?? '')
    setSelectedReader(config.doorbell?.deviceId ?? '')
    setDeviceName(config.doorbell?.deviceName ?? '')
    setDoorName(config.doorbell?.doorName ?? '')
    if (config.unifi?.password?.includes('*')) {
      setHasExistingPassword(true)
    }
    setHasExistingToken(!!config.unifi?.apiTokenSet)
  }, [config])

  useEffect(() => {
    api.getCertificate().then(data => {
      if (data.certificate) setCertificate(data.certificate)
    })
  }, [])

  useEffect(() => {
    if (step === 3) {
      loadTopology()
    }
  }, [step])

  const loadTopology = async () => {
    setLoadingReaders(true)
    setReadersError('')
    try {
      const data = await api.getTopology()
      if (!data.success) {
        throw new Error(data.message ?? t('unknownError'))
      }
      setReaders(data.readers ?? [])
    } catch (err) {
      setReadersError((err as Error).message)
    } finally {
      setLoadingReaders(false)
    }
  }

  const handleFetchCert = async () => {
    setFetchingCert(true)
    setCertStatus(null)
    try {
      const data = await api.fetchCertificate()
      if (data.success && data.certificate) {
        setCertificate(data.certificate)
        await api.saveCertificate(data.certificate)
        setCertStatus({ type: 'success', message: t('wiz.certOk') })
      } else {
        setCertStatus({ type: 'error', message: t('wiz.certFailed', { e: data.message ?? t('unknownError') }) })
      }
    } catch (err) {
      setCertStatus({ type: 'error', message: t('error', { e: (err as Error).message }) })
    } finally {
      setFetchingCert(false)
    }
  }

  const handleTestConnection = async () => {
    setCertStatus({ type: 'info', message: t('wiz.testing') })
    const result = await api.testConnection()
    setCertStatus({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.token) setTokenCheck(result.token)
    if (result.login) setLoginCheck(result.login)
  }

  const handleTestRing = async () => {
    setTestingRing(true)
    setTestRingStatus({ type: 'info', message: t('wiz.ringing') })
    try {
      const result = await api.triggerRing()
      setTestRingStatus({
        type: result.success ? 'success' : 'error',
        message: result.success ? t('wiz.ringOk') : (result.message ?? t('wiz.ringFailed'))
      })
    } catch (err) {
      setTestRingStatus({ type: 'error', message: t('error', { e: (err as Error).message }) })
    } finally {
      setTestingRing(false)
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      if (!host || !username || (!password && !hasExistingPassword)) {
        alert(t('wiz.missing'))
        return
      }
      if (!apiToken && !hasExistingToken) {
        alert(t('wiz.missingToken'))
        return
      }
      const configUpdate: Partial<Config> = {
        unifi: { host, port, username }
      }
      if (password) configUpdate.unifi!.password = password
      if (apiToken) configUpdate.unifi!.apiToken = apiToken
      await api.saveConfig(configUpdate)
    }

    if (step === 2 && certificate.includes('BEGIN CERTIFICATE')) {
      await api.saveCertificate(certificate)
    }

    if (step === 3 && !selectedReader) {
      alert(t('wiz.selectMissing'))
      return
    }

    setStep(step + 1)
  }

  const handleSetManualReader = () => {
    if (!manualReaderId.trim()) {
      alert(t('wiz.manualMissing'))
      return
    }
    setSelectedReader(manualReaderId)
  }

  const handleSaveAndReboot = async () => {
    setSaving(true)
    setSaveStatus({ type: 'info', message: t('wiz.saving') })

    const configUpdate: Partial<Config> = {
      unifi: { host, port, username },
      doorbell: {
        deviceId: selectedReader,
        deviceName,
        doorName
      }
    }

    if (password) configUpdate.unifi!.password = password
    if (apiToken) configUpdate.unifi!.apiToken = apiToken

    try {
      await api.saveConfig(configUpdate)
      setSaveStatus({ type: 'success', message: t('wiz.saved') })
      await api.reboot()
      setSaveStatus({ type: 'success', message: t('wiz.rebootingIn') })
      setTimeout(() => location.reload(), 10000)
    } catch (err) {
      setSaveStatus({ type: 'error', message: t('error', { e: (err as Error).message }) })
      setSaving(false)
    }
  }

  const getStepClass = (s: number) => {
    if (s < step) return 'wizard-step complete'
    if (s === step) return 'wizard-step active'
    return 'wizard-step'
  }

  const stepLabels = [t('wiz.unifi'), t('wiz.cert'), t('wiz.doorbell'), t('wiz.done')]
  const note = (st: { type: string; message: string } | null) =>
    st && <div class={`note ${st.type === 'success' ? 'ok' : st.type}`}>{st.message}</div>
  const check = (c: { ok: boolean; message: string } | null) =>
    c === null ? <em>{t('wiz.notTested')}</em> : <span class={c.ok ? 'ok-text' : 'bad-text'}>{c.ok ? '✓ ' : '✗ '}{c.message}</span>

  return (
    <div class="wizard">
      <ol class="wizard-progress">
        {[1, 2, 3, 4].map(s => (
          <li key={s} class={getStepClass(s)}>
            <button type="button" onClick={() => s < step && setStep(s)} disabled={s >= step}>
              <span class="step-number">{s < step ? '✓' : s}</span>
              <span class="step-label">{stepLabels[s - 1]}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div class="card wizard-content">
          <h3>{t('wiz.s1.title')}</h3>
          <p class="hint lead">{t('wiz.s1.hint')}</p>

          {needsTokenUpgrade && <div class="note info">{t('wiz.upgrade')}</div>}

          <div class="form-group">
            <label for="w-host">{t('wiz.host')}</label>
            <input id="w-host" type="text" placeholder={t('wiz.hostPh')} value={host}
              onInput={(e) => setHost((e.target as HTMLInputElement).value)} />
            <p class="hint">{t('wiz.hostHint')}</p>
          </div>
          <div class="form-group">
            <label for="w-port">{t('wiz.port')}</label>
            <input id="w-port" type="number" min={1} max={65535} value={port}
              onInput={(e) => setPort(Number((e.target as HTMLInputElement).value) || 12445)} />
            <p class="hint">{t('wiz.portHint')}</p>
          </div>
          <div class="form-group">
            <label for="w-token">{t('wiz.token')}</label>
            <input id="w-token" type="password" placeholder={hasExistingToken ? t('wiz.tokenSet') : t('wiz.tokenPh')} value={apiToken}
              onInput={(e) => setApiToken((e.target as HTMLInputElement).value)} />
            <p class="hint">{t('wiz.tokenHint')}</p>
          </div>
          <div class="form-group">
            <label for="w-user">{t('wiz.user')}</label>
            <input id="w-user" type="text" placeholder="doorbell-api" value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)} />
            <p class="hint">{t('wiz.userHint')}</p>
          </div>
          <div class="form-group">
            <label for="w-pass">{t('wiz.pass')}</label>
            <input id="w-pass" type="password" placeholder={hasExistingPassword ? t('wiz.passSet') : ''} value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
          </div>
          <div class="wizard-actions">
            <span />
            <button type="button" class="btn primary" onClick={handleNext}>{t('wiz.next')}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div class="card wizard-content">
          <h3>{t('wiz.s2.title')}</h3>
          <p class="hint lead">{t('wiz.s2.hint')}</p>
          <div class="form-group">
            <button type="button" class="btn" onClick={handleFetchCert} disabled={fetchingCert}>
              {fetchingCert && <span class="spinner"></span>}
              {t('wiz.fetch')}
            </button>
            <p class="hint">
              {t('wiz.manual')} <code>openssl s_client -connect {host || 'HOST'}:443 -showcerts &lt;/dev/null 2&gt;/dev/null | openssl x509 -outform PEM</code>
            </p>
          </div>
          <div class="form-group">
            <label for="w-cert">{t('wiz.pem')}</label>
            <textarea id="w-cert" rows={8} placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'} value={certificate}
              onInput={(e) => setCertificate((e.target as HTMLTextAreaElement).value)} />
          </div>
          {note(certStatus)}
          <div class="wizard-actions">
            <button type="button" class="btn" onClick={() => setStep(1)}>{t('wiz.back')}</button>
            <div class="btn-group">
              <button type="button" class="btn" onClick={handleTestConnection}>{t('wiz.test')}</button>
              <button type="button" class="btn primary" onClick={handleNext}>{t('wiz.next')}</button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div class="card wizard-content">
          <h3>{t('wiz.s3.title')}</h3>
          <p class="hint lead">{t('wiz.s3.hint')}</p>

          {loadingReaders && (
            <div class="note info"><span class="spinner"></span>{t('wiz.loading')}</div>
          )}

          {!loadingReaders && readers.length > 0 && (
            <div class="device-list">
              {readers.map(device => {
                const offline = device.is_online === false
                const display = device.alias || device.name || t('wiz.unnamed')
                const subtitle = device.alias && device.name ? `${device.name} · ${device.type}` : device.type
                return (
                  <label key={device.id} class={`device-item ${selectedReader === device.id ? 'selected' : ''} ${offline ? 'offline' : ''}`}>
                    <input
                      type="radio" name="reader" checked={selectedReader === device.id} disabled={offline}
                      onChange={() => {
                        if (offline) return
                        setSelectedReader(device.id)
                        if (!deviceName) setDeviceName(display)
                      }}
                    />
                    <span class="device-info">
                      <span class="name">{display}{offline && ` (${t('wiz.offline')})`}</span>
                      <span class="meta">{subtitle}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {!loadingReaders && readersError && (
            <div class="note error col">
              <span>{t('wiz.loadFailed', { e: readersError })}</span>
              <span class="row">
                <button type="button" class="btn sm" onClick={loadTopology}>{t('wiz.retry')}</button>
                <span>{t('wiz.orManual')}</span>
              </span>
            </div>
          )}

          {!loadingReaders && readers.length === 0 && !readersError && (
            <div class="note error">{t('wiz.none')}</div>
          )}

          {(readers.length === 0 || readersError) && (
            <div class="form-group">
              <label for="w-manual">{t('wiz.manualEntry')}</label>
              <div class="row">
                <input id="w-manual" type="text" placeholder={t('wiz.manualPh')} value={manualReaderId}
                  onInput={(e) => setManualReaderId((e.target as HTMLInputElement).value)} />
                <button type="button" class="btn" onClick={handleSetManualReader}>{t('wiz.set')}</button>
              </div>
              <p class="hint">{t('wiz.manualHint')}</p>
            </div>
          )}

          <div class="grid-2">
            <div class="form-group">
              <label for="w-dname">{t('wiz.deviceName')}</label>
              <input id="w-dname" type="text" placeholder={t('wiz.deviceNamePh')} value={deviceName}
                onInput={(e) => setDeviceName((e.target as HTMLInputElement).value)} />
            </div>
            <div class="form-group">
              <label for="w-door">{t('wiz.doorName')}</label>
              <input id="w-door" type="text" placeholder={t('wiz.doorNamePh')} value={doorName}
                onInput={(e) => setDoorName((e.target as HTMLInputElement).value)} />
            </div>
          </div>

          <div class="wizard-actions">
            <button type="button" class="btn" onClick={() => setStep(2)}>{t('wiz.back')}</button>
            <button type="button" class="btn primary" onClick={handleNext}>{t('wiz.next')}</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div class="card wizard-content">
          <div class="done">
            <span class="ico lg ok"><CheckIcon size={26} /></span>
            <h3>{t('wiz.s4.title')}</h3>
            <p class="hint">{t('wiz.s4.hint')}</p>
          </div>

          <h4 class="sub-h">{t('wiz.summary')}</h4>
          <div class="kv"><span class="k">{t('wiz.sumHost')}</span><span class="v mono">{host}:{port}</span></div>
          <div class="kv">
            <span class="k">{t('wiz.sumDevice')}</span>
            <span class="v">{(() => {
              const r = readers.find(r => r.id === selectedReader)
              return r ? (r.alias || r.name) : (selectedReader || t('wiz.notSelected'))
            })()}</span>
          </div>
          <div class="kv"><span class="k">{t('wiz.sumTrigger')}</span><span class="v">{check(tokenCheck)}</span></div>
          <div class="kv"><span class="k">{t('wiz.sumDismiss')}</span><span class="v">{check(loginCheck)}</span></div>

          <div class="btn-group spaced">
            <button type="button" class="btn" onClick={handleTestConnection}>{t('wiz.retest')}</button>
            <button type="button" class="btn" onClick={handleTestRing} disabled={testingRing || !selectedReader}>
              {testingRing && <span class="spinner"></span>}
              {t('wiz.testRing')}
            </button>
          </div>

          {note(testRingStatus)}
          {note(saveStatus)}

          <div class="wizard-actions">
            <button type="button" class="btn" onClick={() => setStep(3)} disabled={saving}>{t('wiz.back')}</button>
            <button type="button" class="btn primary" onClick={handleSaveAndReboot} disabled={saving}>
              {saving ? t('wiz.rebooting') : t('wiz.saveReboot')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
