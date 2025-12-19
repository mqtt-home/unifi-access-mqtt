# UniFi Access to MQTT Gateway - Implementation Plan

## Overview

Create a Go-based MQTT bridge for UniFi Access, following the exact structure and patterns of the `eltako-to-mqtt-gw` project.

## Project Structure

```
unifi-access-mqtt/
├── app/
│   ├── config/           # Configuration handling
│   │   └── config.go
│   ├── unifi/            # UniFi Access API client
│   │   ├── client.go     # HTTP client with auth
│   │   ├── api.go        # API endpoints
│   │   ├── types.go      # Data structures
│   │   ├── events.go     # WebSocket/SSE event handling
│   │   └── controller.go # Controller management
│   ├── mqtt/             # MQTT publishing
│   │   └── publisher.go
│   ├── main.go           # Application entry point
│   ├── go.mod
│   ├── go.sum
│   ├── Makefile
│   ├── Dockerfile
│   ├── Dockerfile.goreleaser
│   └── .goreleaser.yml
├── .github/
│   └── workflows/
│       ├── build.yml
│       └── build-release.yml
├── config-example.json
├── renovate.json
├── .gitignore
├── .editorconfig
└── README.md
```

## Implementation Steps

### Phase 1: Project Setup
1. Create Go module `github.com/mqtt-home/unifi-access-mqtt`
2. Create directory structure
3. Add `.gitignore`, `.editorconfig`, `renovate.json`
4. Add Makefile with build targets
5. Add GitHub Actions workflows (build.yml, build-release.yml)
6. Add Dockerfiles

### Phase 2: Configuration
1. Create config structure for:
   - MQTT settings (url, topic, retain, qos)
   - UniFi Access settings (host, username, password)
   - Log level
2. Support environment variable substitution
3. Create config-example.json

### Phase 3: UniFi Access API Client
Based on the homebridge-unifi-access analysis:

1. **Authentication** (`client.go`)
   - POST login with username/password
   - Store authentication token/session
   - Handle token refresh

2. **Bootstrap** (`api.go`)
   - GET /api/v1/developer/bootstrap
   - Parse controller config, devices, doors

3. **Types** (`types.go`)
   - AccessControllerConfig
   - AccessDeviceConfig (UAH, UGT, UA-ULTRA, etc.)
   - DoorConfig
   - AccessEventPacket

4. **Events** (`events.go`)
   - WebSocket connection to UniFi Access
   - Event types:
     - `access.data.device.remote_unlock`
     - `access.data.device.update`
     - `access.data.v2.device.update`
     - `access.data.v2.location.update`

5. **Door Control** (`controller.go`)
   - Unlock door via API
   - Handle different device types (UAH, UGT, UA-ULTRA)

### Phase 4: MQTT Integration
1. Use `github.com/philipparndt/mqtt-gateway` library
2. Publish device states to `{topic}/{door-name}`
3. Subscribe to `{topic}/{door-name}/set` for commands
4. Support commands:
   - `{"action": "unlock"}` - Unlock door
   - `{"action": "lock"}` - Lock door (if supported)

### Phase 5: Main Application
1. Load configuration
2. Initialize logger
3. Connect to UniFi Access controller
4. Bootstrap and discover devices
5. Connect to MQTT broker
6. Start event listener
7. Publish initial states
8. Handle graceful shutdown

## MQTT Topics

### State Topics (Published)
```
home/unifi-access/{door-name}
{
  "door_id": "unique_id",
  "name": "Front Door",
  "lock_status": "locked",      // "locked" | "unlocked"
  "door_status": "closed",      // "open" | "closed"
  "device_type": "UAH",
  "is_online": true
}
```

### Command Topics (Subscribed)
```
home/unifi-access/{door-name}/set
{
  "action": "unlock"            // "unlock" | "lock"
}
```

### Event Topics (Published)
```
home/unifi-access/{door-name}/event
{
  "event": "access.data.device.remote_unlock",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": { ... }
}
```

## UniFi Access API Details

### Authentication
```
POST https://{host}/api/v1/developer/auth/login
Content-Type: application/json
{
  "username": "...",
  "password": "..."
}
Response: Sets session cookie or returns token
```

### Bootstrap
```
GET https://{host}/api/v1/developer/bootstrap
Authorization: Bearer {token}
Response: {
  "version": "...",
  "host": { ... },
  "devices": [...],
  "doors": [...]
}
```

### Unlock Door
```
PUT https://{host}/api/v1/developer/device/{deviceId}/unlock
Authorization: Bearer {token}
```

### Events (WebSocket/SSE)
```
GET wss://{host}/api/v1/developer/devices/notifications
or
GET https://{host}/api/v1/developer/events
```

## Dependencies

- `github.com/philipparndt/go-logger` - Logging
- `github.com/philipparndt/mqtt-gateway` - MQTT connection
- `github.com/gorilla/websocket` - WebSocket client (for events)

## Configuration Example

```json
{
  "mqtt": {
    "url": "tcp://192.168.0.1:1883",
    "topic": "home/unifi-access",
    "retain": true,
    "qos": 1
  },
  "unifi": {
    "host": "192.168.1.1",
    "username": "api-user",
    "password": "secret",
    "verify-ssl": false
  },
  "loglevel": "info"
}
```

## Docker

Multi-stage build similar to eltako-to-mqtt-gw:
1. Build stage with golang:1.24.5-alpine
2. Runtime with gcr.io/distroless/static:nonroot

## Notes

- UniFi Access uses self-signed certificates by default, need to handle TLS verification
- Event handling is crucial for real-time state updates
- Different device types (UAH, UGT, UA-ULTRA, UA-Hub-Door-Mini) may have different capabilities
- The bootstrap endpoint provides initial device discovery

## Doorbell Call Handling (Mission Critical)

Based on research, doorbell call events are handled via WebSocket:

### Events (Received via WebSocket)
- `access.remote_view` - Doorbell ring started, contains `request_id` and `connected_uah_id`
- `access.remote_view.change` - Doorbell call ended/cancelled, contains `remote_call_request_id`

### MQTT Topics for Doorbell
```
home/unifi-access/{door-name}/doorbell       # State: "ringing" or "idle"
home/unifi-access/{door-name}/doorbell/event # Event details when ring starts/ends
```

### Ending a Call
The unlock command (`/api/v1/developer/device/{deviceId}/unlock`) will answer/end a doorbell call.
This is the primary mechanism to programmatically end a call via MQTT:
```
home/unifi-access/{door-name}/set
{"action": "unlock"}
```
