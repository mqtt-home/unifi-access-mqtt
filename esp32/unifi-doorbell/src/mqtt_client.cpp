#include "mqtt_client.h"
#include "logging.h"
#include "config.h"
#include "unifi_api.h"
#include "websocket.h"
#include <WiFiClient.h>
#include <ArduinoJson.h>

static WiFiClient netClient;
PubSubClient mqtt(netClient);

static unsigned long lastMqttReconnect = 0;
#define MQTT_RETRY_INTERVAL 5000

static void mqttCallback(char* topic, byte* payload, unsigned int length);

void setupMqtt() {
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1024);
  mqtt.setSocketTimeout(1);  // 1 second timeout to avoid blocking WebSocket
}

void mqttLoop() {
  mqtt.loop();
}

void mqttReconnect() {
  if (mqtt.connected()) return;
  if (millis() - lastMqttReconnect < MQTT_RETRY_INTERVAL) return;

  lastMqttReconnect = millis();
  logPrintln("MQTT: Connecting to " + String(MQTT_SERVER));

  String clientId = "esp32-doorbell-" + String(random(0xffff), HEX);

  bool connected = false;
  #if defined(MQTT_USERNAME) && defined(MQTT_PASSWORD)
    connected = mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD);
  #else
    connected = mqtt.connect(clientId.c_str());
  #endif

  if (connected) {
    logPrintln("MQTT: Connected");

    String cmdTopic = String(MQTT_TOPIC) + "/set";
    mqtt.subscribe(cmdTopic.c_str());
    logPrintln("MQTT: Subscribed to " + cmdTopic);

    publishDoorbellState(activeRequestId.length() > 0);
  } else {
    logPrintln("MQTT: Failed, rc=" + String(mqtt.state()));
  }
}

void publishDoorbellState(bool ringing) {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["status"] = ringing ? "ringing" : "idle";
  if (ringing && activeRequestId.length() > 0) {
    doc["request_id"] = activeRequestId;
    doc["device_id"] = activeDeviceId;
  }

  String payload;
  serializeJson(doc, payload);

  String topic = String(MQTT_TOPIC) + "/doorbell";
  mqtt.publish(topic.c_str(), payload.c_str(), true);
  logPrintln("MQTT: Published doorbell state: " + payload);
}

static void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  logPrintln("MQTT: Received [" + String(topic) + "]: " + message);

  String topicStr = String(topic);

  if (topicStr.endsWith("/set")) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);
    if (!error) {
      String action = doc["action"] | "";

      if (action == "dismiss" || action == "cancel" || action == "end_call") {
        if (activeRequestId.length() > 0 && activeDeviceId.length() > 0) {
          if (unifiDismissCall(activeDeviceId, activeRequestId)) {
            activeRequestId = "";
            activeDeviceId = "";
            activeConnectedUahId = "";
            publishDoorbellState(false);
          }
        } else {
          logPrintln("MQTT: No active doorbell call to dismiss");
        }
      }
      else if (action == "ring") {
        unifiTriggerRing();
      }
    }
  }
}
