#include "gpio.h"
#include "logging.h"
#include "config_manager.h"
#include "unifi_api.h"
#include "websocket.h"
#include "mqtt_client.h"
#include <ArduinoJson.h>

// GPIO state array
GpioState gpioStates[CFG_MAX_GPIO_PINS];

// Forward declaration for MQTT publishing
void publishGpioState(int index, bool state);
static void gpioSamplerTask(void*);

void setupGpio() {
    // Initialize state array
    for (int i = 0; i < CFG_MAX_GPIO_PINS; i++) {
        gpioStates[i].currentState = false;
        gpioStates[i].lastRawState = true;  // Assume pull-up (inactive = HIGH)
        gpioStates[i].triggered = false;
        gpioStates[i].lastChange = 0;
        gpioStates[i].pendingTrigger = false;
        gpioStates[i].pendingRelease = false;
    }

    // Configure each enabled GPIO
    for (int i = 0; i < appConfig.gpioCount; i++) {
        if (!appConfig.gpios[i].enabled) continue;

        uint8_t pin = appConfig.gpios[i].pin;
        GpioPullMode pullMode = appConfig.gpios[i].pullMode;

        if (pullMode == GPIO_PULL_UP) {
            pinMode(pin, INPUT_PULLUP);
            gpioStates[i].lastRawState = HIGH;
        } else {
            pinMode(pin, INPUT_PULLDOWN);
            gpioStates[i].lastRawState = LOW;
        }

        log("GPIO: Pin " + String(pin) + " configured as " +
                   String(appConfig.gpios[i].label) +
                   " (pull-" + (pullMode == GPIO_PULL_UP ? "up" : "down") + ")");
    }

    log("GPIO: " + String(appConfig.gpioCount) + " pins configured");

    static bool samplerStarted = false;
    if (!samplerStarted) {
        samplerStarted = true;
        xTaskCreate(gpioSamplerTask, "gpio", 3072, NULL, 3, NULL);
    }
}

// Debounce/hold detection. Runs in its own task: the main loop blocks for many
// seconds at a time (UniFi login, WebSocket teardown), far longer than a
// doorbell pulse, so sampling there silently dropped rings. The sampler only
// latches flags; the actions (blocking HTTP/MQTT) stay on the main loop.
static void sampleGpio() {
    unsigned long now = millis();

    for (int i = 0; i < appConfig.gpioCount; i++) {
        GpioConfig& config = appConfig.gpios[i];
        GpioState& state = gpioStates[i];

        if (!config.enabled) continue;

        // Read current state
        bool rawState = digitalRead(config.pin);

        // Debounce: check if state changed
        if (rawState != state.lastRawState) {
            if ((now - state.lastChange) > config.debounceMs) {
                state.lastChange = now;
                state.lastRawState = rawState;

                // Determine if this is the "active" state based on pull mode
                // Pull-up: active = LOW, Pull-down: active = HIGH
                bool isActive = (config.pullMode == GPIO_PULL_UP) ? (rawState == LOW) : (rawState == HIGH);

                // If transitioning to inactive, reset trigger flag
                if (!isActive) {
                    if (state.triggered) {
                        state.pendingRelease = true;
                    }
                    state.triggered = false;
                    state.currentState = false;
                }
            }
        }

        // Determine active state
        bool isActive = (config.pullMode == GPIO_PULL_UP) ?
                        (state.lastRawState == LOW) : (state.lastRawState == HIGH);

        // Check if held long enough to trigger
        if (isActive && !state.triggered && (now - state.lastChange) > config.holdMs) {
            state.triggered = true;
            state.currentState = true;
            state.pendingTrigger = true;
        }
    }
}

static void gpioSamplerTask(void*) {
    for (;;) {
        sampleGpio();
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

void checkGpioTriggers() {
    for (int i = 0; i < appConfig.gpioCount; i++) {
        GpioConfig& config = appConfig.gpios[i];
        GpioState& state = gpioStates[i];

        if (!config.enabled) continue;

        if (state.pendingTrigger) {
            state.pendingTrigger = false;

            // Execute action based on type
            switch (config.action) {
                case GPIO_ACTION_RING_BUTTON:
                    log("GPIO: Ring triggered (" + String(config.label) + ")");
                    unifiTriggerRing();
                    websocketLoop();  // Service WebSocket after blocking API call
                    break;

                case GPIO_ACTION_DOOR_CONTACT:
                    if (activeRequestId.length() > 0 && activeDeviceId.length() > 0) {
                        log("GPIO: Dismiss triggered (" + String(config.label) + ")");
                        if (unifiDismissCall(activeDeviceId, activeRequestId)) {
                            activeRequestId = "";
                            activeDeviceId = "";
                            activeConnectedUahId = "";
                            publishDoorbellState(false);
                            websocketLoop();  // Service WebSocket after blocking API call
                        }
                    } else {
                        log("GPIO: Door contact triggered but no active call (" + String(config.label) + ")");
                    }
                    break;

                case GPIO_ACTION_GENERIC:
                    log("GPIO: Generic trigger (" + String(config.label) + ")");
                    publishGpioState(i, true);
                    break;

                default:
                    break;
            }
        }

        // For generic GPIOs, publish the release after the trigger it belongs to
        if (state.pendingRelease) {
            state.pendingRelease = false;
            if (config.action == GPIO_ACTION_GENERIC) {
                publishGpioState(i, false);
            }
        }
    }
}

bool getGpioState(int index) {
    if (index < 0 || index >= appConfig.gpioCount) return false;
    return gpioStates[index].currentState;
}

const char* getGpioStateString(int index) {
    if (index < 0 || index >= appConfig.gpioCount) return "unknown";
    return gpioStates[index].currentState ? "active" : "idle";
}

// Publish GPIO state to MQTT (for generic GPIOs)
void publishGpioState(int index, bool active) {
    if (!appConfig.mqttEnabled) return;
    if (index < 0 || index >= appConfig.gpioCount) return;
    if (appConfig.gpios[index].action != GPIO_ACTION_GENERIC) return;
    if (!mqtt.connected()) return;

    // Build topic: {mqttTopic}/gpio/{label}
    String label = appConfig.gpios[index].label;
    // Sanitize label for MQTT topic (replace spaces with underscores, lowercase)
    label.toLowerCase();
    label.replace(" ", "_");
    label.replace("/", "_");

    String topic = String(appConfig.mqttTopic) + "/gpio/" + label;

    // Build payload
    JsonDocument doc;
    doc["state"] = active ? "active" : "idle";
    doc["pin"] = appConfig.gpios[index].pin;

    String payload;
    serializeJson(doc, payload);

    mqtt.publish(topic.c_str(), payload.c_str(), true);  // Retained
    log("MQTT: Published GPIO state: " + topic + " = " + (active ? "active" : "idle"));
}
