# UniFi Access MQTT Trace

A tool to connect to the UniFi Access MQTT broker and trace/decode messages.

## Building

```bash
go build -o mqtt-trace .
```

## Usage

```bash
./mqtt-trace -broker <gateway-ip> \
  -ca ../scripts/certs/ca-cert.pem \
  -cert ../scripts/certs/mqtt-client-cert.pem \
  -key ../scripts/certs/mqtt-client-priv.pem
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-broker` | (required) | MQTT broker address (Cloud Gateway IP) |
| `-port` | `12812` | MQTT broker port |
| `-ca` | `ca-cert.pem` | CA certificate file |
| `-cert` | `mqtt-client-cert.pem` | Client certificate file |
| `-key` | `mqtt-client-priv.pem` | Client private key file |
| `-topic` | `#` | MQTT topic to subscribe to |
| `-v` | `false` | Verbose output (show hex dump) |
| `-raw` | `false` | Raw mode (hex dump only, no decoding) |

### Examples

```bash
# Trace all messages
./mqtt-trace -broker 10.1.0.1 -ca ../scripts/certs/ca-cert.pem \
  -cert ../scripts/certs/mqtt-client-cert.pem \
  -key ../scripts/certs/mqtt-client-priv.pem

# Trace only device stats
./mqtt-trace -broker 10.1.0.1 -topic '/uctrl/+/device/+/stat' ...

# Trace RPC commands
./mqtt-trace -broker 10.1.0.1 -topic '/uctrl/+/device/+/rpc' ...

# Verbose mode with hex dump
./mqtt-trace -broker 10.1.0.1 -v ...

# Raw hex dump only
./mqtt-trace -broker 10.1.0.1 -raw ...
```

## Topic Patterns

| Pattern | Description |
|---------|-------------|
| `/uctrl/{controller}/heart` | Heartbeat messages |
| `/uctrl/{controller}/device/{device}/stat` | Device status updates |
| `/uctrl/{controller}/device/{device}/rpc` | RPC commands |
| `/uctrl/{controller}/device/{device}/event` | Device events |

## Output

The tool attempts to decode binary messages and extract readable fields:
- Key=value pairs are highlighted
- Device types are identified
- Hex dump shown in verbose mode

Color coding:
- Gray: Heartbeat messages, timestamps
- Cyan: Device stat messages, device IDs
- Yellow: RPC messages, device names
- Purple: Events, firmware versions
- Green: IP addresses, connection status
