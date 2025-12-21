#include "gpio.h"
#include "logging.h"
#include "config.h"
#include "unifi_api.h"
#include "websocket.h"
#include "mqtt_client.h"

// =============================================================================
// Pin Configuration (from config.h or defaults)
// =============================================================================
#ifndef PIN_DISMISS_TRIGGER
  #if defined(USE_ETHERNET)
    #define PIN_DISMISS_TRIGGER   36  // Olimex: Input-only GPIO
  #else
    #define PIN_DISMISS_TRIGGER   1   // ESP32-S3-Zero: GP1
  #endif
#endif

#ifndef PIN_RING_TRIGGER
  #if defined(USE_ETHERNET)
    #define PIN_RING_TRIGGER      34  // Olimex: BUT1 button (GPIO34, input-only with 10K pullup)
  #else
    #define PIN_RING_TRIGGER      0   // ESP32-S3-Zero: GPIO0 = BOOT button
  #endif
#endif

#define DEBOUNCE_MS           50
#define TRIGGER_HOLD_MS       100

// GPIO state
static unsigned long lastDismissChange = 0;
static unsigned long lastRingChange = 0;
static bool lastDismissState = HIGH;
static bool lastRingState = HIGH;
static bool dismissTriggered = false;
static bool ringTriggered = false;

void setupGpio() {
  pinMode(PIN_DISMISS_TRIGGER, INPUT_PULLUP);
  pinMode(PIN_RING_TRIGGER, INPUT_PULLUP);

  logPrintln("GPIO Dismiss: " + String(PIN_DISMISS_TRIGGER));
  logPrintln("GPIO Ring: " + String(PIN_RING_TRIGGER));
}

void checkGpioTriggers() {
  unsigned long now = millis();

  bool dismissState = digitalRead(PIN_DISMISS_TRIGGER);
  if (dismissState != lastDismissState) {
    if ((now - lastDismissChange) > DEBOUNCE_MS) {
      lastDismissChange = now;
      lastDismissState = dismissState;
      if (dismissState == HIGH) {
        dismissTriggered = false;
      }
    }
  }

  if (dismissState == LOW && !dismissTriggered && (now - lastDismissChange) > TRIGGER_HOLD_MS) {
    dismissTriggered = true;
    if (activeRequestId.length() > 0 && activeDeviceId.length() > 0) {
      logPrintln("GPIO: Dismiss triggered");
      if (unifiDismissCall(activeDeviceId, activeRequestId)) {
        activeRequestId = "";
        activeDeviceId = "";
        activeConnectedUahId = "";
        publishDoorbellState(false);
        // Service WebSocket after blocking API call
        websocketLoop();
      }
    } else {
      logPrintln("GPIO: Dismiss pressed but no active call");
    }
  }

  bool ringState = digitalRead(PIN_RING_TRIGGER);
  if (ringState != lastRingState) {
    if ((now - lastRingChange) > DEBOUNCE_MS) {
      lastRingChange = now;
      lastRingState = ringState;
      if (ringState == HIGH) {
        ringTriggered = false;
      }
    }
  }

  if (ringState == LOW && !ringTriggered && (now - lastRingChange) > TRIGGER_HOLD_MS) {
    ringTriggered = true;
    logPrintln("GPIO: Ring triggered");
    unifiTriggerRing();
    // Service WebSocket after blocking API call
    websocketLoop();
  }
}
