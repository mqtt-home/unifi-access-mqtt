import type { ComponentChildren } from 'preact'
import type { Status } from '../types'
import api from '../api/api'
import { useI18n } from '../lib/i18n'
import type { Key } from '../lib/i18n'
import { BellIcon, BellRingIcon, DoorIcon, NetworkIcon, RadioIcon } from './Icons'

interface StatusTabProps {
  status: Status
  ringing: boolean
}

type Tone = 'ok' | 'bad' | 'warn' | 'idle' | ''

function Stat({ icon, label, value, tone }: { icon: ComponentChildren; label: string; value: string; tone: Tone }) {
  return (
    <div class={`stat ${tone}`}>
      <div class="k">{icon}{label}</div>
      <div class="v">
        {tone && <span class={`dot ${tone === 'ok' ? '' : tone}${tone === 'warn' ? ' live' : ''}`} />}
        <span>{value}</span>
      </div>
    </div>
  )
}

export function StatusTab({ status, ringing }: StatusTabProps) {
  const { t, num } = useI18n()

  const handleTriggerRing = async () => {
    if (!confirm(t('test.confirm'))) return
    const result = await api.triggerRing()
    if (!result.success) {
      alert(t('test.failed', { e: result.message ?? t('unknownError') }))
    }
  }

  const formatUptime = (seconds?: number) => {
    if (seconds === undefined) return '–'
    const m = Math.floor(seconds / 60) % 60
    const h = Math.floor(seconds / 3600) % 24
    const d = Math.floor(seconds / 86400)
    if (d > 0) return t('uptime.d', { d: num(d), h })
    if (h > 0) return t('uptime.h', { h, m })
    return t('uptime.m', { m })
  }

  const kb = (bytes?: number) => bytes === undefined ? '–' : `${num(Math.round(bytes / 1024))} KB`

  const net = status.network
  const unifi = status.unifi
  const sys = status.system

  const doorbell = status.doorbell === undefined
    ? { v: '–', tone: '' as Tone }
    : ringing ? { v: t('stat.ringing'), tone: 'warn' as Tone } : { v: t('stat.idle'), tone: 'ok' as Tone }

  const network = net === undefined
    ? { v: '–', tone: '' as Tone }
    : net.connected
      ? { v: t(net.type === 'ethernet' ? 'stat.ethernet' : 'stat.wifi'), tone: 'ok' as Tone }
      : { v: t('stat.disconnected'), tone: 'bad' as Tone }

  const access = unifi === undefined
    ? { v: '–', tone: '' as Tone }
    : unifi.wsConnected ? { v: t('stat.connected'), tone: 'ok' as Tone }
    : unifi.error ? { v: unifi.error, tone: 'bad' as Tone }
    : unifi.loggedIn ? { v: t('stat.loggedIn'), tone: 'warn' as Tone }
    : unifi.configured ? { v: t('stat.loggingIn'), tone: 'warn' as Tone }
    : { v: t('stat.notConfigured'), tone: 'idle' as Tone }

  const mqtt = status.mqtt === undefined
    ? { v: '–', tone: '' as Tone }
    : status.mqtt.connected ? { v: t('stat.connected'), tone: 'ok' as Tone } : { v: t('stat.mqttOff'), tone: 'idle' as Tone }

  const gpios = status.gpios ?? []

  return (
    <section class="stack">
      <div class="stats">
        <Stat icon={ringing ? <BellRingIcon size={14} /> : <BellIcon size={14} />} label={t('stat.doorbell')} value={doorbell.v} tone={doorbell.tone} />
        <Stat icon={<NetworkIcon size={14} />} label={t('stat.network')} value={network.v} tone={network.tone} />
        <Stat icon={<DoorIcon size={14} />} label={t('stat.unifi')} value={access.v} tone={access.tone} />
        <Stat icon={<RadioIcon size={14} />} label={t('stat.mqtt')} value={mqtt.v} tone={mqtt.tone} />
      </div>

      <div class="cards">
        <div class="card">
          <div class="card-h"><h3>{t('device.title')}</h3></div>
          <div class="card-b">
            <div class="kv"><span class="k">{t('device.ip')}</span><span class="v mono">{net?.ip ?? '–'}</span></div>
            <div class="kv">
              <span class="k">{t('device.heap')}</span>
              <span class="v">
                {kb(sys?.heap)}
                {sys?.heapMin !== undefined && <small> · {t('device.heapMin', { n: num(Math.round(sys.heapMin / 1024)) })}</small>}
              </span>
            </div>
            <div class="kv"><span class="k">{t('device.uptime')}</span><span class="v">{formatUptime(sys?.uptime)}</span></div>
            {sys?.cpuMhz !== undefined && (
              <div class="kv"><span class="k">{t('device.cpu')}</span><span class="v">{num(sys.cpuMhz)} MHz</span></div>
            )}
            {unifi?.wsReconnects !== undefined && (
              <div class="kv"><span class="k">{t('device.reconnects')}</span><span class="v">{t('device.reconnectsN', { n: num(unifi.wsReconnects) })}</span></div>
            )}
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-h"><h3>{t('inputs.title')}</h3></div>
            <div class="card-b">
              {gpios.length === 0 && <p class="hint">{t('inputs.empty')}</p>}
              {gpios.map(g => (
                <div class="kv" key={g.pin}>
                  <span class="k">
                    {g.label} <small class="mono">GPIO {g.pin} · {t(`action.short.${g.action}` as Key)}</small>
                  </span>
                  <span class="v">
                    <span class={`chip ${g.state === 'active' ? 'warn' : ''}`}>
                      {g.state === 'active' ? t('inputs.active') : t('inputs.idle')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3>{t('test.title')}</h3></div>
            <div class="card-b row">
              <p class="hint grow">{t('test.hint')}</p>
              <button type="button" class="btn" onClick={handleTriggerRing}><BellIcon size={16} />{t('test.ring')}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
