import { useState, useEffect } from 'preact/hooks'
import type { Config, GpioConfig, MqttTrigger } from '../types'
import api from '../api/api'
import { useI18n } from '../lib/i18n'
import type { Key } from '../lib/i18n'
import { PlusIcon, XIcon } from './Icons'

interface SettingsTabProps {
  config: Config
  gpios: GpioConfig[]
  mqttTriggers: MqttTrigger[]
  onAddGpio: (gpio: GpioConfig) => void
  onRemoveGpio: (index: number) => void
  onUpdateGpio: (index: number, field: keyof GpioConfig, value: unknown) => void
  onAddMqttTrigger: (trigger: MqttTrigger) => void
  onRemoveMqttTrigger: (index: number) => void
  onUpdateMqttTrigger: (index: number, field: keyof MqttTrigger, value: unknown) => void
  onReload: () => void
}

const gpioPresets: Record<string, { name: string; pins: Omit<GpioConfig, 'enabled' | 'debounceMs' | 'holdMs'>[] }> = {
  'olimex-poe': {
    name: 'Olimex ESP32-POE',
    pins: [
      { pin: 34, label: 'BUT1 Button', action: 'ring_button', pullMode: 'up' },
      { pin: 36, label: 'GPIO36', action: 'door_contact', pullMode: 'up' },
      { pin: 39, label: 'GPIO39', action: 'generic', pullMode: 'up' },
      { pin: 32, label: 'GPIO32', action: 'generic', pullMode: 'up' },
      { pin: 33, label: 'GPIO33', action: 'generic', pullMode: 'up' },
      { pin: 35, label: 'GPIO35', action: 'generic', pullMode: 'up' }
    ]
  },
  'esp32-s3-zero': {
    name: 'ESP32-S3-Zero',
    pins: [
      { pin: 0, label: 'BOOT Button', action: 'ring_button', pullMode: 'up' },
      { pin: 1, label: 'GPIO1', action: 'door_contact', pullMode: 'up' },
      { pin: 2, label: 'GPIO2', action: 'generic', pullMode: 'up' },
      { pin: 3, label: 'GPIO3', action: 'generic', pullMode: 'up' },
      { pin: 4, label: 'GPIO4', action: 'generic', pullMode: 'up' }
    ]
  }
}

export function SettingsTab({
  config, gpios, mqttTriggers,
  onAddGpio, onRemoveGpio, onUpdateGpio,
  onAddMqttTrigger, onRemoveMqttTrigger, onUpdateMqttTrigger,
  onReload
}: SettingsTabProps) {
  const { t } = useI18n()
  const [wifiSsid, setWifiSsid] = useState(config.network?.wifiSsid ?? '')
  const [wifiPassword, setWifiPassword] = useState('')
  const [mqttEnabled, setMqttEnabled] = useState(config.mqtt?.enabled ?? false)
  const [mqttServer, setMqttServer] = useState(config.mqtt?.server ?? '')
  const [mqttPort, setMqttPort] = useState(config.mqtt?.port ?? 1883)
  const [mqttTopic, setMqttTopic] = useState(config.mqtt?.topic ?? '')
  const [mqttAuth, setMqttAuth] = useState(config.mqtt?.authEnabled ?? false)
  const [mqttUsername, setMqttUsername] = useState(config.mqtt?.username ?? '')
  const [mqttPassword, setMqttPassword] = useState('')
  const [webUsername, setWebUsername] = useState(config.web?.username ?? '')
  const [webPassword, setWebPassword] = useState('')
  const [showGpioMenu, setShowGpioMenu] = useState(false)
  const [selectedBoard, setSelectedBoard] = useState('olimex-poe')
  const [showWiringDiagram, setShowWiringDiagram] = useState<'up' | 'down' | null>(null)
  const isEthernet = config.network?.wifiSsid === undefined

  const wiringDiagrams = {
    up: `
┌─────────────────────────────────┐
│           ESP32                 │
│                                 │
│  3.3V ──┬── GPIO (internal)     │
│         │   pull-up resistor    │
│         R   ~45kΩ               │
│         │                       │
│  GPIO ──┴──────┬────────────    │
│                │                │
└────────────────│────────────────┘
                 │
              [Button]
                 │
                GND

`,
    down: `
┌─────────────────────────────────┐
│           ESP32                 │
│                                 │
│  GND ───┬── GPIO (internal)     │
│         │   pull-down resistor  │
│         R   ~45kΩ               │
│         │                       │
│  GPIO ──┴──────┬────────────    │
│                │                │
└────────────────│────────────────┘
                 │
              [Button]
                 │
               3.3V

`
  }

  useEffect(() => {
    setWifiSsid(config.network?.wifiSsid ?? '')
    setMqttEnabled(config.mqtt?.enabled ?? false)
    setMqttServer(config.mqtt?.server ?? '')
    setMqttPort(config.mqtt?.port ?? 1883)
    setMqttTopic(config.mqtt?.topic ?? '')
    setMqttAuth(config.mqtt?.authEnabled ?? false)
    setMqttUsername(config.mqtt?.username ?? '')
    setWebUsername(config.web?.username ?? '')
  }, [config])

  const handleSave = async () => {
    const result = await api.saveConfig({
      network: { wifiSsid, wifiPassword },
      mqtt: {
        enabled: mqttEnabled,
        server: mqttServer,
        port: mqttPort,
        topic: mqttTopic,
        authEnabled: mqttAuth,
        username: mqttUsername,
        password: mqttPassword
      },
      web: { username: webUsername, password: webPassword },
      gpios,
      mqttTriggers
    })

    if (result.success) {
      alert(t('set.saved'))
    } else {
      alert(t('set.saveFailed', { e: result.message ?? t('unknownError') }))
    }
  }

  const handleAddGpioFromPreset = (pin: typeof gpioPresets['olimex-poe']['pins'][0]) => {
    if (gpios.length >= 8) {
      alert(t('set.maxGpio'))
      return
    }
    if (gpios.some(g => g.pin === pin.pin)) {
      alert(t('set.gpioUsed', { pin: pin.pin }))
      return
    }
    onAddGpio({
      enabled: true,
      pin: pin.pin,
      action: pin.action,
      pullMode: pin.pullMode,
      label: pin.label,
      debounceMs: 50,
      holdMs: 100
    })
    setShowGpioMenu(false)
  }

  const handleAddCustomGpio = () => {
    if (gpios.length >= 8) {
      alert(t('set.maxGpio'))
      return
    }
    onAddGpio({
      enabled: true,
      pin: 34,
      action: 'ring_button',
      pullMode: 'up',
      label: t('set.newGpio'),
      debounceMs: 50,
      holdMs: 100
    })
    setShowGpioMenu(false)
  }

  const handleAddMqttTrigger = () => {
    if (mqttTriggers.length >= 4) {
      alert(t('set.maxTrigger'))
      return
    }
    onAddMqttTrigger({
      enabled: true,
      topic: '',
      jsonField: 'contact',
      triggerValue: 'false',
      action: 'dismiss',
      label: t('set.newTrigger')
    })
  }

  const getGpioHelpText = (gpio: GpioConfig) => {
    const pull = t(gpio.pullMode === 'up' ? 'set.help.up' : 'set.help.down')
    const topic = mqttTopic || 'doorbell'
    const label = (gpio.label || 'gpio').toLowerCase().replace(/\s+/g, '_')
    return t(`set.help.${gpio.action}` as Key, { pull, topic: `${topic}/gpio/${label}` })
  }

  const getMqttTriggerHelpText = (trigger: MqttTrigger) => {
    if (!trigger.topic || !trigger.jsonField) return t('set.trigger.incomplete')
    return t('set.trigger.help', {
      topic: trigger.topic,
      field: trigger.jsonField,
      value: trigger.triggerValue,
      action: t(trigger.action === 'ring' ? 'set.trigger.ring' : 'set.trigger.dismiss')
    })
  }

  const input = (value: string, onInput: (v: string) => void, opts: { password?: boolean; placeholder?: string; id?: string } = {}) => {
    const handle = (e: Event) => onInput((e.target as HTMLInputElement).value)
    return opts.password
      ? <input id={opts.id} type="password" placeholder={opts.placeholder} value={value} onInput={handle} />
      : <input id={opts.id} type="text" placeholder={opts.placeholder} value={value} onInput={handle} />
  }

  return (
    <section class="stack">
      <div class="cards">
        {!isEthernet && (
          <div class="card">
            <div class="card-h"><h3>{t('set.wifi')}</h3></div>
            <div class="card-b">
              <div class="form-group">
                <label for="s-ssid">{t('set.ssid')}</label>
                {input(wifiSsid, setWifiSsid, { id: 's-ssid', placeholder: t('set.ssidPh') })}
              </div>
              <div class="form-group">
                <label for="s-wpass">{t('set.password')}</label>
                {input(wifiPassword, setWifiPassword, { id: 's-wpass', password: true, placeholder: t('set.keep') })}
              </div>
            </div>
          </div>
        )}

        <div class="card">
          <div class="card-h col">
            <h3>{t('set.mqtt')}</h3>
            <p class="hint">{t('set.mqttSub')}</p>
          </div>
          <div class="card-b">
            <label class="toggle-group">
              <span class="toggle">
                <input type="checkbox" checked={mqttEnabled} onChange={(e) => setMqttEnabled((e.target as HTMLInputElement).checked)} />
                <span class="toggle-slider"></span>
              </span>
              <span>{t('set.mqttEnable')}</span>
            </label>

            {mqttEnabled && (
              <>
                <div class="form-group">
                  <label for="s-mserver">{t('set.server')}</label>
                  {input(mqttServer, setMqttServer, { id: 's-mserver', placeholder: 'mqtt.local' })}
                </div>
                <div class="grid-2">
                  <div class="form-group">
                    <label for="s-mport">{t('set.port')}</label>
                    <input
                      id="s-mport" type="number" min={1} max={65535} value={mqttPort}
                      onInput={(e) => setMqttPort(parseInt((e.target as HTMLInputElement).value) || 1883)}
                    />
                  </div>
                  <div class="form-group">
                    <label for="s-mtopic">{t('set.topic')}</label>
                    {input(mqttTopic, setMqttTopic, { id: 's-mtopic', placeholder: 'home/doorbell' })}
                  </div>
                </div>
                <label class="toggle-group">
                  <span class="toggle">
                    <input type="checkbox" checked={mqttAuth} onChange={(e) => setMqttAuth((e.target as HTMLInputElement).checked)} />
                    <span class="toggle-slider"></span>
                  </span>
                  <span>{t('set.auth')}</span>
                </label>
                {mqttAuth && (
                  <div class="grid-2">
                    <div class="form-group">
                      <label for="s-muser">{t('set.username')}</label>
                      {input(mqttUsername, setMqttUsername, { id: 's-muser' })}
                    </div>
                    <div class="form-group">
                      <label for="s-mpass">{t('set.password')}</label>
                      {input(mqttPassword, setMqttPassword, { id: 's-mpass', password: true, placeholder: t('set.keep') })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div class="card">
          <div class="card-h"><h3>{t('set.web')}</h3></div>
          <div class="card-b">
            <div class="form-group">
              <label for="s-wuser">{t('set.username')}</label>
              {input(webUsername, setWebUsername, { id: 's-wuser' })}
            </div>
            <div class="form-group">
              <label for="s-wnew">{t('set.newPassword')}</label>
              {input(webPassword, setWebPassword, { id: 's-wnew', password: true, placeholder: t('set.keep') })}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h col">
          <h3>{t('set.gpio')}</h3>
          <p class="hint">{t('set.gpioSub')}</p>
        </div>
        <div class="card-b">
          {gpios.map((gpio, index) => (
            <div key={index} class="item">
              <div class="item-h">
                <span class="item-t">GPIO {gpio.pin} · {gpio.label || t('set.unnamed')}</span>
                <button type="button" class="btn sm danger" onClick={() => onRemoveGpio(index)}>{t('set.remove')}</button>
              </div>
              <div class="fields-4">
                <div class="form-group">
                  <label>{t('set.pin')}</label>
                  <input
                    type="number" min={0} max={48} value={gpio.pin}
                    onChange={(e) => onUpdateGpio(index, 'pin', parseInt((e.target as HTMLInputElement).value))}
                  />
                </div>
                <div class="form-group">
                  <label>{t('set.label')}</label>
                  <input
                    type="text" value={gpio.label}
                    onChange={(e) => onUpdateGpio(index, 'label', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="form-group">
                  <label>{t('set.action')}</label>
                  <select value={gpio.action} onChange={(e) => onUpdateGpio(index, 'action', (e.target as HTMLSelectElement).value)}>
                    <option value="ring_button">{t('action.ring_button')}</option>
                    <option value="door_contact">{t('action.door_contact')}</option>
                    <option value="generic">{t('action.generic')}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>{t('set.pull')}</label>
                  <select value={gpio.pullMode} onChange={(e) => onUpdateGpio(index, 'pullMode', (e.target as HTMLSelectElement).value)}>
                    <option value="up">{t('set.pullUp')}</option>
                    <option value="down">{t('set.pullDown')}</option>
                  </select>
                </div>
              </div>
              <div class="item-help">
                <span class="grow">{getGpioHelpText(gpio)}</span>
                <button
                  type="button" class="btn sm" onClick={() => setShowWiringDiagram(gpio.pullMode)}
                  title={t('set.wiring')} aria-label={t('set.wiring')}
                >?</button>
              </div>
            </div>
          ))}
          <button type="button" class="btn" onClick={() => setShowGpioMenu(true)}><PlusIcon size={16} />{t('set.addGpio')}</button>
        </div>
      </div>

      {mqttEnabled && (
        <div class="card">
          <div class="card-h col">
            <h3>{t('set.triggers')}</h3>
            <p class="hint">{t('set.triggersSub')}</p>
          </div>
          <div class="card-b">
            {mqttTriggers.length === 0 && <p class="empty">{t('set.triggersEmpty')}</p>}
            {mqttTriggers.map((trigger, index) => (
              <div key={index} class="item">
                <div class="item-h">
                  <span class="item-t">{trigger.label || t('set.unnamedTrigger')}</span>
                  <button type="button" class="btn sm danger" onClick={() => onRemoveMqttTrigger(index)}>{t('set.remove')}</button>
                </div>
                <div class="fields-5">
                  <div class="form-group">
                    <label>{t('set.label')}</label>
                    <input
                      type="text" placeholder={t('set.triggerLabelPh')} value={trigger.label}
                      onChange={(e) => onUpdateMqttTrigger(index, 'label', (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="form-group">
                    <label>{t('set.topic')}</label>
                    <input
                      type="text" placeholder="zigbee2mqtt/door_sensor" value={trigger.topic}
                      onChange={(e) => onUpdateMqttTrigger(index, 'topic', (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="form-group">
                    <label>{t('set.jsonField')}</label>
                    <input
                      type="text" placeholder="contact" value={trigger.jsonField}
                      onChange={(e) => onUpdateMqttTrigger(index, 'jsonField', (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="form-group">
                    <label>{t('set.triggerValue')}</label>
                    <input
                      type="text" placeholder="false" value={trigger.triggerValue}
                      onChange={(e) => onUpdateMqttTrigger(index, 'triggerValue', (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="form-group">
                    <label>{t('set.action')}</label>
                    <select value={trigger.action} onChange={(e) => onUpdateMqttTrigger(index, 'action', (e.target as HTMLSelectElement).value)}>
                      <option value="dismiss">{t('set.dismissCall')}</option>
                      <option value="ring">{t('set.ringDoorbell')}</option>
                    </select>
                  </div>
                </div>
                <div class="item-help">{getMqttTriggerHelpText(trigger)}</div>
              </div>
            ))}
            <button type="button" class="btn" onClick={handleAddMqttTrigger}><PlusIcon size={16} />{t('set.addTrigger')}</button>
          </div>
        </div>
      )}

      <div class="save-bar">
        <button type="button" class="btn primary" onClick={handleSave}>{t('set.save')}</button>
        <button type="button" class="btn" onClick={onReload}>{t('set.reload')}</button>
      </div>

      {showGpioMenu && (
        <div class="modal-bg" onClick={() => setShowGpioMenu(false)}>
          <div class="modal card wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div class="modal-h">
              <h3>{t('set.addTitle')}</h3>
              <button type="button" class="icon-btn" onClick={() => setShowGpioMenu(false)} aria-label={t('close')}><XIcon /></button>
            </div>
            <div class="modal-b">
              <div class="seg board-seg" role="group" aria-label={t('set.board')}>
                {Object.entries(gpioPresets).map(([key, board]) => (
                  <button key={key} type="button" aria-pressed={key === selectedBoard} onClick={() => setSelectedBoard(key)}>
                    {board.name}
                  </button>
                ))}
              </div>
              <div class="pin-grid">
                {gpioPresets[selectedBoard].pins.map(pin => {
                  const isUsed = gpios.some(g => g.pin === pin.pin)
                  return (
                    <button
                      key={pin.pin} type="button" class="pin-tile" disabled={isUsed}
                      onClick={() => !isUsed && handleAddGpioFromPreset(pin)}
                    >
                      <span class="pin-n mono">GPIO {pin.pin}</span>
                      <span class="pin-l">{pin.label}</span>
                      <span class="chip">{t(`action.short.${pin.action}` as Key)}</span>
                    </button>
                  )
                })}
              </div>
              <button type="button" class="pin-custom" onClick={handleAddCustomGpio}>
                <PlusIcon />
                <span>
                  <span class="pin-l">{t('set.custom')}</span>
                  <span class="hint">{t('set.customSub')}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showWiringDiagram && (
        <div class="modal-bg" onClick={() => setShowWiringDiagram(null)}>
          <div class="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div class="modal-h">
              <h3>{t('set.wiringTitle')}</h3>
              <button type="button" class="icon-btn" onClick={() => setShowWiringDiagram(null)} aria-label={t('close')}><XIcon /></button>
            </div>
            <div class="modal-b">
              <div class="seg" role="group">
                <button type="button" aria-pressed={showWiringDiagram === 'up'} onClick={() => setShowWiringDiagram('up')}>{t('set.pullUp')}</button>
                <button type="button" aria-pressed={showWiringDiagram === 'down'} onClick={() => setShowWiringDiagram('down')}>{t('set.pullDown')}</button>
              </div>
              <pre class="diagram">{wiringDiagrams[showWiringDiagram]}{'\n'}{t(showWiringDiagram === 'up' ? 'set.wiring.up' : 'set.wiring.down')}</pre>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
