# UniFi Access MQTT Gateway

[![mqtt-smarthome](https://img.shields.io/badge/mqtt-smarthome-blue.svg)](https://github.com/mqtt-smarthome/mqtt-smarthome)

A MQTT gateway for UniFi Access controllers. This application bridges UniFi Access door controllers to MQTT, enabling integration with home automation systems.

## Features

- Real-time door lock/unlock status via WebSocket events
- Doorbell ring notifications (for devices with doorbell capability)
- Remote door unlock via MQTT commands
- Support for multiple door types (UAH, UGT, UA-ULTRA, UA-Hub-Door-Mini)
- Automatic reconnection on connection loss

## Supported Devices

- **UA Hub (UAH)** - Standard access hub
- **UA Gate (UGT)** - Gate controller with dual door support
- **UA Ultra (UA-ULTRA)** - Advanced access reader
- **UA Hub Door Mini (UA-Hub-Door-Mini)** - Compact door controller

## MQTT Topics

### State Topics (Published)

Door state is published to `{topic}/{door-name}`:

```json
{
    "door_id": "unique-device-id",
    "name": "Front Door",
    "lock_status": "locked",
    "door_status": "closed",
    "device_type": "UAH",
    "is_online": true,
    "has_doorbell": true
}
```

| Field | Description |
|-------|-------------|
| `door_id` | Unique device identifier |
| `name` | Door display name |
| `lock_status` | `"locked"` or `"unlocked"` |
| `door_status` | `"open"` or `"closed"` |
| `device_type` | Device model type |
| `is_online` | Device online status |
| `has_doorbell` | Whether device has doorbell capability |

### Doorbell Topics (Published)

For devices with doorbell capability, doorbell state is published to `{topic}/{door-name}/doorbell`:

```json
{
    "door_id": "unique-device-id",
    "name": "Front Door",
    "status": "ringing",
    "request_id": "call-request-id"
}
```

| Field | Description |
|-------|-------------|
| `status` | `"ringing"` or `"idle"` |
| `request_id` | Call request ID (only when ringing) |

### Command Topics (Subscribed)

Send commands to `{topic}/{door-name}/set`:

#### Unlock Door

```json
{"action": "unlock"}
```

This will unlock the door. The door will automatically re-lock after the timeout configured in UniFi Access.

**Note:** Unlocking a door while a doorbell call is active will answer/end the call.

#### Trigger Doorbell Ring

```json
{"action": "ring"}
```

Triggers a doorbell ring event programmatically. This simulates pressing the doorbell button and will notify all configured viewers (e.g., UA Intercom Viewer devices). Useful for testing or automation scenarios.

## Configuration

Create a `config.json` file:

```json
{
    "mqtt": {
        "url": "tcp://192.168.0.1:1883",
        "topic": "home/unifi-access",
        "retain": true,
        "qos": 1
    },
    "unifi": {
        "host": "https://192.168.1.1",
        "username": "api-user",
        "password": "your-password",
        "verify-ssl": false
    },
    "loglevel": "info"
}
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `mqtt.url` | MQTT broker URL |
| `mqtt.topic` | Base MQTT topic for all messages |
| `mqtt.retain` | Retain messages on the broker |
| `mqtt.qos` | Quality of Service level (0, 1, or 2) |
| `unifi.host` | UniFi Access controller URL |
| `unifi.username` | API user username |
| `unifi.password` | API user password |
| `unifi.verify-ssl` | Verify SSL certificates (default: false) |
| `loglevel` | Log level: trace, debug, info, warn, error |

### Environment Variables

Configuration values can be replaced with environment variables using the syntax `${ENV_VAR}`:

```json
{
    "mqtt": {
        "url": "${MQTT_URL}",
        "topic": "home/unifi-access"
    },
    "unifi": {
        "host": "${UNIFI_HOST}",
        "username": "${UNIFI_USERNAME}",
        "password": "${UNIFI_PASSWORD}"
    }
}
```

## UniFi Access Setup

1. Log into your UniFi Access controller
2. Navigate to **Settings** > **Users**
3. Create a new user with API access permissions
4. Use these credentials in your configuration

## Running

### Binary

```bash
./unifi-access-mqtt /path/to/config.json
```

### Docker

```bash
docker run -d \
    -v /path/to/config.json:/var/lib/unifi-access-mqtt/config.json:ro \
    --name unifi-access-mqtt \
    pharndt/unifi-access-mqtt:latest
```

### Docker Compose

```yaml
version: "3"
services:
  unifi-access-mqtt:
    image: pharndt/unifi-access-mqtt:latest
    container_name: unifi-access-mqtt
    restart: unless-stopped
    volumes:
      - ./config.json:/var/lib/unifi-access-mqtt/config.json:ro
    environment:
      - TZ=Europe/Berlin
```

## Building from Source

### Prerequisites

- Go 1.23 or later

### Build

```bash
cd app
make build
```

### Run

```bash
./build/unifi-access-mqtt /path/to/config.json
```

## Events

The gateway receives real-time events from UniFi Access via WebSocket:

| Event | Description |
|-------|-------------|
| `access.remote_view` | Doorbell ring started |
| `access.remote_view.change` | Doorbell call ended |
| `access.data.device.remote_unlock` | Door unlocked remotely |
| `access.data.device.update` | Device state updated |
| `access.data.v2.device.update` | Device state updated (v2) |
| `access.data.v2.location.update` | Location/door state updated |

## Home Assistant Integration

Example configuration for Home Assistant:

```yaml
mqtt:
  lock:
    - name: "Front Door"
      state_topic: "home/unifi-access/front-door"
      command_topic: "home/unifi-access/front-door/set"
      value_template: "{{ value_json.lock_status }}"
      payload_lock: '{"action": "lock"}'
      payload_unlock: '{"action": "unlock"}'
      state_locked: "locked"
      state_unlocked: "unlocked"

  binary_sensor:
    - name: "Front Door"
      state_topic: "home/unifi-access/front-door"
      value_template: "{{ value_json.door_status }}"
      payload_on: "open"
      payload_off: "closed"
      device_class: door

    - name: "Front Door Doorbell"
      state_topic: "home/unifi-access/front-door/doorbell"
      value_template: "{{ value_json.status }}"
      payload_on: "ringing"
      payload_off: "idle"
      device_class: sound
```

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
