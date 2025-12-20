package main

import (
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var (
	broker   = flag.String("broker", "", "MQTT broker address (e.g., 10.1.0.1)")
	port     = flag.Int("port", 12812, "MQTT broker port")
	caFile   = flag.String("ca", "ca-cert.pem", "CA certificate file")
	certFile = flag.String("cert", "mqtt-client-cert.pem", "Client certificate file")
	keyFile  = flag.String("key", "mqtt-client-priv.pem", "Client private key file")
	topic    = flag.String("topic", "#", "MQTT topic to subscribe to")
	verbose  = flag.Bool("v", false, "Verbose output (show hex dump)")
	rawMode  = flag.Bool("raw", false, "Raw mode (no decoding)")

	// RPC command flags
	sendRPC      = flag.String("rpc", "", "Send RPC command: remote_view, remote_open_door")
	controllerID = flag.String("controller", "", "Controller ID (MAC without colons, e.g., 28704e275599)")
	viewerID     = flag.String("viewer", "", "Viewer device ID (MAC without colons)")
	readerID     = flag.String("reader", "", "Reader device ID (for remote_view source)")
)

// ANSI colors for terminal output
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
	colorPurple = "\033[35m"
	colorCyan   = "\033[36m"
	colorGray   = "\033[90m"
	colorBold   = "\033[1m"
)

func main() {
	flag.Parse()

	if *broker == "" {
		log.Fatal("Broker address is required. Use -broker flag.")
	}

	tlsConfig, err := newTLSConfig(*caFile, *certFile, *keyFile)
	if err != nil {
		log.Fatalf("Failed to create TLS config: %v", err)
	}

	clientID := fmt.Sprintf("mqtt-trace-%d", time.Now().UnixNano())
	opts := mqtt.NewClientOptions()
	opts.AddBroker(fmt.Sprintf("ssl://%s:%d", *broker, *port))
	opts.SetClientID(clientID)
	opts.SetTLSConfig(tlsConfig)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)

	opts.SetOnConnectHandler(func(c mqtt.Client) {
		fmt.Printf("%s[CONNECTED]%s to %s:%d\n", colorGreen, colorReset, *broker, *port)

		// If sending RPC, do it now
		if *sendRPC != "" {
			sendRPCCommand(c, clientID)
			return
		}

		token := c.Subscribe(*topic, 0, messageHandler)
		token.Wait()
		if token.Error() != nil {
			log.Printf("Subscribe error: %v", token.Error())
		} else {
			fmt.Printf("%s[SUBSCRIBED]%s to topic: %s\n", colorCyan, colorReset, *topic)
		}
	})

	opts.SetConnectionLostHandler(func(c mqtt.Client, err error) {
		fmt.Printf("%s[DISCONNECTED]%s %v\n", colorRed, colorReset, err)
	})

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("Failed to connect: %v", token.Error())
	}

	// If RPC mode, wait a bit for response then exit
	if *sendRPC != "" {
		time.Sleep(3 * time.Second)
		client.Disconnect(250)
		return
	}

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nDisconnecting...")
	client.Disconnect(250)
}

// sendRPCCommand sends an RPC command to a device
func sendRPCCommand(client mqtt.Client, clientID string) {
	if *controllerID == "" {
		log.Fatal("Controller ID is required for RPC. Use -controller flag.")
	}
	if *viewerID == "" {
		log.Fatal("Viewer device ID is required for RPC. Use -viewer flag.")
	}

	// Subscribe to response topic
	responseTopic := fmt.Sprintf("/uctrl/%s/device/%s/rpc/%s/response", *controllerID, *viewerID, clientID)
	token := client.Subscribe(responseTopic, 0, func(c mqtt.Client, msg mqtt.Message) {
		fmt.Printf("\n%s[RPC RESPONSE]%s on %s\n", colorGreen, colorReset, msg.Topic())
		decodeRPCResponse(msg.Payload())
	})
	token.Wait()
	if token.Error() != nil {
		log.Printf("Failed to subscribe to response topic: %v", token.Error())
	}

	// Build and send RPC request
	requestTopic := fmt.Sprintf("/uctrl/%s/device/%s/rpc/%s/request", *controllerID, *viewerID, clientID)
	requestID := generateRequestID()

	var payload []byte
	var path string

	switch *sendRPC {
	case "remote_view":
		path = "/remote_view"
		payload = buildRemoteViewPayload(requestID)
	case "remote_open_door":
		path = "/remote_open_door"
		payload = buildRemoteOpenDoorPayload(requestID)
	default:
		log.Fatalf("Unknown RPC command: %s. Supported: remote_view, remote_open_door", *sendRPC)
	}

	// Build the Message wrapper
	message := buildMQTTMessage(path, requestID, payload)

	fmt.Printf("%s[SENDING RPC]%s %s to %s\n", colorYellow, colorReset, path, requestTopic)
	fmt.Printf("  Request ID: %s\n", requestID)
	if *verbose {
		fmt.Printf("  Payload (%d bytes):\n%s", len(message), hex.Dump(message))
	}

	pubToken := client.Publish(requestTopic, 0, false, message)
	pubToken.Wait()
	if pubToken.Error() != nil {
		log.Printf("Failed to publish: %v", pubToken.Error())
	} else {
		fmt.Printf("%s[SENT]%s Waiting for response...\n", colorGreen, colorReset)
	}
}

// generateRequestID generates a unique request ID
func generateRequestID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("rpc-%x", b)
}

// buildMQTTMessage builds the protobuf Message wrapper
func buildMQTTMessage(path, requestID string, innerPayload []byte) []byte {
	var buf []byte

	// Add meta: path
	buf = append(buf, encodeMetaData("path", path)...)

	// Add meta: requestId
	buf = append(buf, encodeMetaData("requestId", requestID)...)

	// Add payloads field (field 2, length-delimited)
	if len(innerPayload) > 0 {
		buf = append(buf, 0x12) // field 2, wire type 2
		buf = append(buf, encodeVarint(uint64(len(innerPayload)))...)
		buf = append(buf, innerPayload...)
	}

	return buf
}

// encodeMetaData encodes a MetaData proto (field 1 in Message)
func encodeMetaData(key, value string) []byte {
	// Build MetaData message
	var meta []byte
	// key (field 1)
	meta = append(meta, 0x0a) // field 1, wire type 2
	meta = append(meta, encodeVarint(uint64(len(key)))...)
	meta = append(meta, []byte(key)...)
	// value (field 2)
	meta = append(meta, 0x12) // field 2, wire type 2
	meta = append(meta, encodeVarint(uint64(len(value)))...)
	meta = append(meta, []byte(value)...)

	// Wrap in Message field 1 (repeated MetaData)
	var buf []byte
	buf = append(buf, 0x0a) // field 1, wire type 2
	buf = append(buf, encodeVarint(uint64(len(meta)))...)
	buf = append(buf, meta...)

	return buf
}

// buildRemoteViewPayload builds a DARemoteView protobuf message
func buildRemoteViewPayload(requestID string) []byte {
	var buf []byte

	// Generate a channel ID (format: PR-{uuid-like})
	channelID := fmt.Sprintf("PR-%s", requestID)

	// agura_channel (field 1, required)
	buf = append(buf, 0x0a) // field 1, wire type 2
	buf = append(buf, encodeVarint(uint64(len(channelID)))...)
	buf = append(buf, []byte(channelID)...)

	// device_id (field 5) - source reader
	if *readerID != "" {
		buf = append(buf, 0x2a) // field 5, wire type 2
		buf = append(buf, encodeVarint(uint64(len(*readerID)))...)
		buf = append(buf, []byte(*readerID)...)
	}

	// action (field 6) - "ring"
	action := "ring"
	buf = append(buf, 0x32) // field 6, wire type 2
	buf = append(buf, encodeVarint(uint64(len(action)))...)
	buf = append(buf, []byte(action)...)

	// room_id (field 9) - same as channel
	buf = append(buf, 0x4a) // field 9, wire type 2
	buf = append(buf, encodeVarint(uint64(len(channelID)))...)
	buf = append(buf, []byte(channelID)...)

	// request_id (field 10)
	buf = append(buf, 0x52) // field 10, wire type 2
	buf = append(buf, encodeVarint(uint64(len(requestID)))...)
	buf = append(buf, []byte(requestID)...)

	return buf
}

// buildRemoteOpenDoorPayload builds a DARemoteOpenDoor protobuf message
func buildRemoteOpenDoorPayload(requestID string) []byte {
	var buf []byte

	// request_id (field 1)
	buf = append(buf, 0x0a) // field 1, wire type 2
	buf = append(buf, encodeVarint(uint64(len(requestID)))...)
	buf = append(buf, []byte(requestID)...)

	// user_name (field 3)
	userName := "MQTT Trigger"
	buf = append(buf, 0x1a) // field 3, wire type 2
	buf = append(buf, encodeVarint(uint64(len(userName)))...)
	buf = append(buf, []byte(userName)...)

	return buf
}

// encodeVarint encodes a uint64 as a protobuf varint
func encodeVarint(v uint64) []byte {
	var buf []byte
	for v >= 0x80 {
		buf = append(buf, byte(v)|0x80)
		v >>= 7
	}
	buf = append(buf, byte(v))
	return buf
}

// decodeRPCResponse decodes and displays an RPC response
func decodeRPCResponse(data []byte) {
	if len(data) == 0 {
		fmt.Printf("  %s<empty response>%s\n", colorGray, colorReset)
		return
	}

	fields := parseProtobufFields(data)
	for _, field := range fields {
		if field.WireType == 2 { // Length-delimited (likely MetaData)
			// Try to parse as nested MetaData
			innerFields := parseProtobufFields(field.Data)
			if len(innerFields) >= 2 {
				key := sanitizeString(string(innerFields[0].Data))
				value := sanitizeString(string(innerFields[1].Data))
				if key != "" && value != "" {
					valueColor := colorReset
					if key == "code" {
						if value == "0" {
							valueColor = colorGreen
						} else {
							valueColor = colorRed
						}
					}
					fmt.Printf("  %s: %s%s%s\n", key, valueColor, value, colorReset)
					continue
				}
			}
		}
		value := sanitizeString(string(field.Data))
		if value != "" {
			fmt.Printf("  field_%d: %s\n", field.FieldNumber, value)
		}
	}
}

func newTLSConfig(caFile, certFile, keyFile string) (*tls.Config, error) {
	caCert, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA cert: %w", err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to parse CA cert")
	}

	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load client cert: %w", err)
	}

	return &tls.Config{
		RootCAs:            caCertPool,
		Certificates:       []tls.Certificate{cert},
		InsecureSkipVerify: true,
		MinVersion:         tls.VersionTLS12,
	}, nil
}

func messageHandler(client mqtt.Client, msg mqtt.Message) {
	topicStr := msg.Topic()
	payload := msg.Payload()
	timestamp := time.Now().Format("15:04:05.000")

	// Determine topic type for coloring
	topicColor := colorBlue
	isHeartbeat := strings.Contains(topicStr, "/heart")
	isStat := strings.Contains(topicStr, "/stat")
	isRPC := strings.Contains(topicStr, "/rpc")

	if isHeartbeat {
		topicColor = colorGray
	} else if isStat {
		topicColor = colorCyan
	} else if isRPC {
		topicColor = colorYellow
	} else if strings.Contains(topicStr, "/event") {
		topicColor = colorPurple
	}

	fmt.Printf("\n%s[%s]%s %s%s%s (%d bytes)\n",
		colorGray, timestamp, colorReset,
		topicColor, topicStr, colorReset,
		len(payload))

	if *rawMode {
		fmt.Println(hex.Dump(payload))
		return
	}

	// Decode based on topic type
	var decoded string
	if isHeartbeat {
		decoded = decodeHeartbeat(payload)
	} else if isStat {
		decoded = decodeDeviceStat(payload)
	} else if isRPC {
		decoded = decodeRPC(payload)
	} else {
		decoded = decodeGenericProtobuf(payload)
	}

	fmt.Print(decoded)

	if *verbose && len(payload) > 0 {
		fmt.Printf("\n%s--- Hex dump ---%s\n", colorGray, colorReset)
		fmt.Println(hex.Dump(payload))
	}
}

// decodeHeartbeat handles heartbeat messages (typically wrapped "ping")
func decodeHeartbeat(data []byte) string {
	if len(data) == 0 {
		return fmt.Sprintf("  %s<empty>%s\n", colorGray, colorReset)
	}

	// Check for wrapped string: 0x12 <len> <string>
	if len(data) >= 3 && data[0] == 0x12 {
		length := int(data[1])
		if length+2 <= len(data) {
			inner := data[2 : 2+length]
			if isPrintableBytes(inner) {
				return fmt.Sprintf("  %s%s%s\n", colorGray, string(inner), colorReset)
			}
		}
	}

	// Plain text
	if isPrintableBytes(data) {
		return fmt.Sprintf("  %s\n", string(data))
	}

	return formatHexClean(data)
}

// decodeDeviceStat decodes a DeviceStat message
func decodeDeviceStat(data []byte) string {
	if len(data) == 0 {
		return fmt.Sprintf("  %s<empty>%s\n", colorGray, colorReset)
	}

	var result strings.Builder

	// Skip outer wrapper if present (field 2 = 0x12, length-delimited)
	innerData := data
	if len(data) > 3 && data[0] == 0x12 {
		length, bytesRead := decodeVarint(data[1:])
		if bytesRead > 0 && int(length)+bytesRead+1 <= len(data) {
			innerData = data[1+bytesRead : 1+bytesRead+int(length)]
		}
	}

	// Parse the DeviceStat protobuf fields
	fields := parseProtobufFields(innerData)
	if len(fields) == 0 {
		return formatHexClean(data)
	}

	// Extract known fields
	var deviceID, model, deviceName string
	var attrs []string

	for _, field := range fields {
		switch field.FieldNumber {
		case 1: // id
			deviceID = sanitizeString(string(field.Data))
		case 2: // model
			model = sanitizeString(string(field.Data))
		case 3: // name
			deviceName = sanitizeString(string(field.Data))
		case 4: // attrs (repeated)
			attrs = append(attrs, sanitizeString(string(field.Data)))
		}
	}

	// Print header line
	if model != "" || deviceName != "" {
		result.WriteString(fmt.Sprintf("  %s%s%s %s%s%s\n",
			colorBold+colorCyan, model, colorReset,
			colorGreen, deviceName, colorReset))
	}
	if deviceID != "" {
		result.WriteString(fmt.Sprintf("  %sDevice ID:%s %s\n", colorGray, colorReset, deviceID))
	}

	// Print attributes
	for _, attr := range attrs {
		if attr == "" {
			continue
		}
		if idx := strings.Index(attr, "="); idx > 0 {
			key := attr[:idx]
			val := attr[idx+1:]
			if val == "" {
				continue
			}

			valueColor := colorReset
			switch key {
			case "ipv4", "ipv6":
				valueColor = colorGreen
			case "mac":
				valueColor = colorCyan
			case "fw", "app_ver", "firmware_id":
				valueColor = colorPurple
			case "name":
				valueColor = colorYellow
			case "adopted", "security_check":
				if val == "true" {
					valueColor = colorGreen
				} else {
					valueColor = colorRed
				}
			case "uptime":
				if secs, err := parseUint(val); err == nil {
					val = formatDuration(secs)
				}
			case "timestamp", "start_time":
				valueColor = colorGray
			}
			result.WriteString(fmt.Sprintf("  %-20s %s%s%s\n", key, valueColor, val, colorReset))
		}
	}

	if result.Len() == 0 {
		return formatHexClean(data)
	}

	return result.String()
}

// decodeRPC decodes an RPC message
func decodeRPC(data []byte) string {
	if len(data) == 0 {
		return fmt.Sprintf("  %s<empty>%s\n", colorGray, colorReset)
	}

	fields := parseProtobufFields(data)
	if len(fields) == 0 {
		return formatHexClean(data)
	}

	var result strings.Builder
	result.WriteString(fmt.Sprintf("  %sRPC Message%s\n", colorYellow, colorReset))

	for _, field := range fields {
		value := sanitizeString(string(field.Data))
		if value != "" {
			result.WriteString(fmt.Sprintf("  field_%d: %s\n", field.FieldNumber, value))
		}
	}

	return result.String()
}

// decodeGenericProtobuf attempts to decode any protobuf message
func decodeGenericProtobuf(data []byte) string {
	if len(data) == 0 {
		return fmt.Sprintf("  %s<empty>%s\n", colorGray, colorReset)
	}

	// Check if it's plain text first
	if isPrintableBytes(data) {
		return fmt.Sprintf("  %s\n", sanitizeString(string(data)))
	}

	fields := parseProtobufFields(data)
	if len(fields) == 0 {
		return formatHexClean(data)
	}

	var result strings.Builder
	for _, field := range fields {
		value := sanitizeString(string(field.Data))
		if value == "" {
			continue
		}

		if idx := strings.Index(value, "="); idx > 0 {
			key := value[:idx]
			val := value[idx+1:]
			if val != "" {
				result.WriteString(fmt.Sprintf("  %-20s %s\n", key, val))
			}
		} else {
			result.WriteString(fmt.Sprintf("  field_%d: %s\n", field.FieldNumber, value))
		}
	}

	if result.Len() == 0 {
		return formatHexClean(data)
	}

	return result.String()
}

// ProtobufField represents a parsed protobuf field
type ProtobufField struct {
	FieldNumber int
	WireType    int
	Data        []byte
}

// parseProtobufFields parses protobuf wire format
func parseProtobufFields(data []byte) []ProtobufField {
	var fields []ProtobufField
	offset := 0

	for offset < len(data) {
		// Read tag (varint)
		tag, bytesRead := decodeVarint(data[offset:])
		if bytesRead == 0 {
			break
		}
		offset += bytesRead

		fieldNumber := int(tag >> 3)
		wireType := int(tag & 0x7)

		// Validate field number (should be 1-536870911 per protobuf spec, but we limit to reasonable values)
		if fieldNumber == 0 || fieldNumber > 100 {
			break
		}

		var fieldData []byte

		switch wireType {
		case 0: // Varint
			val, n := decodeVarint(data[offset:])
			if n == 0 {
				return fields
			}
			offset += n
			fieldData = []byte(fmt.Sprintf("%d", val))

		case 1: // 64-bit fixed
			if offset+8 > len(data) {
				return fields
			}
			val := binary.LittleEndian.Uint64(data[offset : offset+8])
			fieldData = []byte(fmt.Sprintf("%d", val))
			offset += 8

		case 2: // Length-delimited
			length, n := decodeVarint(data[offset:])
			if n == 0 || length > 10000 { // Sanity check on length
				return fields
			}
			offset += n
			if offset+int(length) > len(data) {
				return fields
			}
			fieldData = data[offset : offset+int(length)]
			offset += int(length)

		case 5: // 32-bit fixed
			if offset+4 > len(data) {
				return fields
			}
			val := binary.LittleEndian.Uint32(data[offset : offset+4])
			fieldData = []byte(fmt.Sprintf("%d", val))
			offset += 4

		default:
			// Unknown wire type
			return fields
		}

		fields = append(fields, ProtobufField{
			FieldNumber: fieldNumber,
			WireType:    wireType,
			Data:        fieldData,
		})
	}

	return fields
}

// decodeVarint decodes a protobuf varint
func decodeVarint(data []byte) (uint64, int) {
	var result uint64
	var shift uint
	for i, b := range data {
		if i >= binary.MaxVarintLen64 {
			return 0, 0
		}
		result |= uint64(b&0x7F) << shift
		if b&0x80 == 0 {
			return result, i + 1
		}
		shift += 7
	}
	return 0, 0
}

// isPrintableBytes checks if all bytes are printable ASCII
func isPrintableBytes(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	for _, b := range data {
		if b < 32 || b > 126 {
			if b != '\n' && b != '\r' && b != '\t' {
				return false
			}
		}
	}
	return true
}

// sanitizeString removes non-printable characters
func sanitizeString(s string) string {
	var result strings.Builder
	for _, r := range s {
		if r >= 32 && r <= 126 {
			result.WriteRune(r)
		} else if r == '\n' || r == '\t' {
			result.WriteRune(' ')
		}
	}
	return strings.TrimSpace(result.String())
}

func formatHexClean(data []byte) string {
	var result strings.Builder
	const bytesPerLine = 16

	for i := 0; i < len(data); i += bytesPerLine {
		end := i + bytesPerLine
		if end > len(data) {
			end = len(data)
		}
		line := data[i:end]

		result.WriteString(fmt.Sprintf("  %s%04x%s  ", colorGray, i, colorReset))
		for j, b := range line {
			if j == 8 {
				result.WriteString(" ")
			}
			if b >= 32 && b <= 126 {
				result.WriteString(fmt.Sprintf("%s%02x%s ", colorGreen, b, colorReset))
			} else {
				result.WriteString(fmt.Sprintf("%02x ", b))
			}
		}

		for j := len(line); j < bytesPerLine; j++ {
			if j == 8 {
				result.WriteString(" ")
			}
			result.WriteString("   ")
		}

		result.WriteString(" |")
		for _, b := range line {
			if b >= 32 && b <= 126 {
				result.WriteString(fmt.Sprintf("%s%c%s", colorGreen, b, colorReset))
			} else {
				result.WriteString(".")
			}
		}
		result.WriteString("|\n")
	}

	return result.String()
}

func parseUint(s string) (uint64, error) {
	var result uint64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid number")
		}
		result = result*10 + uint64(c-'0')
	}
	return result, nil
}

func formatDuration(seconds uint64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	mins := (seconds % 3600) / 60
	secs := seconds % 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
	} else if hours > 0 {
		return fmt.Sprintf("%dh %dm %ds", hours, mins, secs)
	} else if mins > 0 {
		return fmt.Sprintf("%dm %ds", mins, secs)
	}
	return fmt.Sprintf("%ds", secs)
}
