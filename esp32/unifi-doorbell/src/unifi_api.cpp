#include "unifi_api.h"
#include "logging.h"
#include "config.h"
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

// Session state
String csrfToken = "";
String sessionCookie = "";
String userId = "";
String userName = "";
bool isLoggedIn = false;

// Resolved device IDs
String resolvedDoorbellDeviceId = "";
String resolvedViewerIds[4];
int resolvedViewerCount = 0;

// Internal helper functions
static String readHttpResponse(WiFiClientSecure& client);
static int extractStatusCode(const String& response);
static String extractHeader(const String& response, const String& headerName);
static String extractCookie(const String& response, const String& cookieName);

// =============================================================================
// Public API Functions
// =============================================================================

bool unifiLogin() {
  logPrintln("UniFi: Logging in...");

  WiFiClientSecure client;
  client.setInsecure();

  if (!client.connect(UNIFI_HOST, 443)) {
    logPrintln("UniFi: Connection failed");
    return false;
  }

  // Step 1: Get initial CSRF token
  client.println("GET / HTTP/1.1");
  client.println("Host: " + String(UNIFI_HOST));
  client.println("Connection: keep-alive");
  client.println();

  String response = readHttpResponse(client);
  csrfToken = extractHeader(response, "X-Csrf-Token");
  logPrintln("UniFi: Got initial CSRF token");

  client.stop();
  delay(100);

  // Step 2: Login
  if (!client.connect(UNIFI_HOST, 443)) {
    logPrintln("UniFi: Reconnection failed");
    return false;
  }

  JsonDocument loginDoc;
  loginDoc["username"] = UNIFI_USERNAME;
  loginDoc["password"] = UNIFI_PASSWORD;
  loginDoc["token"] = "";
  loginDoc["rememberMe"] = true;

  String loginBody;
  serializeJson(loginDoc, loginBody);

  client.println("POST /api/auth/login HTTP/1.1");
  client.println("Host: " + String(UNIFI_HOST));
  client.println("Content-Type: application/json");
  client.println("Content-Length: " + String(loginBody.length()));
  if (csrfToken.length() > 0) {
    client.println("X-Csrf-Token: " + csrfToken);
  }
  client.println("Connection: close");
  client.println();
  client.print(loginBody);

  response = readHttpResponse(client);

  // Extract new CSRF token
  String newToken = extractHeader(response, "X-Updated-Csrf-Token");
  if (newToken.length() == 0) {
    newToken = extractHeader(response, "X-Csrf-Token");
  }
  if (newToken.length() > 0) {
    csrfToken = newToken;
  }

  // Extract session cookie
  sessionCookie = extractCookie(response, "TOKEN");

  client.stop();

  if (sessionCookie.length() > 0) {
    logPrintln("UniFi: Login successful");
    userId = UNIFI_USERNAME;
    userName = UNIFI_USERNAME;
    isLoggedIn = true;
    return true;
  }

  logPrintln("UniFi: Login failed - no session cookie");
  return false;
}

bool unifiBootstrap() {
  logPrintln("UniFi: Resolving device IDs...");

  // Reset viewer count for re-bootstrap
  resolvedViewerCount = 0;

  // Resolve doorbell device ID
  String configuredId = DOORBELL_DEVICE_ID;

  if (configuredId.indexOf(":") >= 0 || configuredId.indexOf("-") >= 0) {
    resolvedDoorbellDeviceId = normalizeMAC(configuredId);
    logPrintln("UniFi: Doorbell MAC " + configuredId + " -> ID " + resolvedDoorbellDeviceId);
  } else {
    resolvedDoorbellDeviceId = configuredId;
    logPrintln("UniFi: Doorbell ID: " + resolvedDoorbellDeviceId);
  }

  // Resolve viewer IDs
  #ifdef VIEWER_ID_1
  {
    String viewerId = VIEWER_ID_1;
    if (viewerId.indexOf(":") >= 0 || viewerId.indexOf("-") >= 0) {
      resolvedViewerIds[resolvedViewerCount++] = normalizeMAC(viewerId);
      logPrintln("UniFi: Viewer MAC " + viewerId + " -> ID " + resolvedViewerIds[resolvedViewerCount-1]);
    } else {
      resolvedViewerIds[resolvedViewerCount++] = viewerId;
      logPrintln("UniFi: Viewer ID: " + viewerId);
    }
  }
  #endif

  #ifdef VIEWER_ID_2
  {
    String viewerId = VIEWER_ID_2;
    if (viewerId.indexOf(":") >= 0 || viewerId.indexOf("-") >= 0) {
      resolvedViewerIds[resolvedViewerCount++] = normalizeMAC(viewerId);
      logPrintln("UniFi: Viewer MAC " + viewerId + " -> ID " + resolvedViewerIds[resolvedViewerCount-1]);
    } else {
      resolvedViewerIds[resolvedViewerCount++] = viewerId;
      logPrintln("UniFi: Viewer ID: " + viewerId);
    }
  }
  #endif

  logPrintln("UniFi: Bootstrap complete - " + String(resolvedViewerCount) + " viewers configured");
  return true;
}

bool unifiDismissCall(const String& deviceId, const String& requestId) {
  if (!isLoggedIn || requestId.length() == 0) {
    logPrintln("UniFi: Cannot dismiss - not logged in or no request ID");
    return false;
  }

  logPrintln("UniFi: Dismissing doorbell call: " + requestId);

  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["response"] = "denied";
  doc["request_id"] = requestId;
  doc["user_id"] = userId;
  doc["user_name"] = userName;

  String body;
  serializeJson(doc, body);

  String path = "/proxy/access/api/v2/device/" + deviceId + "/reply_remote";

  WiFiClientSecure apiClient;
  apiClient.setInsecure();
  apiClient.setTimeout(10000);

  if (!apiClient.connect(UNIFI_HOST, 443)) {
    logPrintln("UniFi: Connection failed");
    return false;
  }

  apiClient.println("POST " + path + " HTTP/1.1");
  apiClient.println("Host: " + String(UNIFI_HOST));
  apiClient.println("Content-Type: application/json");
  apiClient.println("Content-Length: " + String(body.length()));
  apiClient.println("X-Csrf-Token: " + csrfToken);
  apiClient.println("Cookie: TOKEN=" + sessionCookie);
  apiClient.println("Connection: close");
  apiClient.println();
  apiClient.print(body);

  String statusLine = apiClient.readStringUntil('\n');
  int statusCode = 0;
  int spaceIdx = statusLine.indexOf(' ');
  if (spaceIdx > 0) {
    int endIdx = statusLine.indexOf(' ', spaceIdx + 1);
    if (endIdx > 0) {
      statusCode = statusLine.substring(spaceIdx + 1, endIdx).toInt();
    }
  }

  while (apiClient.available()) {
    apiClient.read();
  }
  apiClient.stop();

  bool success = (statusCode >= 200 && statusCode < 300);
  if (success) {
    logPrintln("UniFi: Doorbell call dismissed");
  } else {
    logPrintln("UniFi: Dismiss failed, status: " + String(statusCode));
  }

  return success;
}

bool unifiTriggerRing() {
  if (!isLoggedIn) {
    logPrintln("UniFi: Cannot trigger - not logged in");
    return false;
  }

  String deviceId = resolvedDoorbellDeviceId;
  if (deviceId.length() == 0) {
    deviceId = DOORBELL_DEVICE_ID;
  }

  logPrintln("UniFi: Triggering doorbell ring on device: " + deviceId);

  String requestId = generateRandomString(32);
  String roomId = "PR-" + generateUUID();
  time_t now = time(nullptr);

  JsonDocument doc;
  doc["request_id"] = requestId;
  doc["agora_channel"] = roomId;
  doc["controller_id"] = deviceId;
  doc["device_id"] = deviceId;
  doc["device_name"] = DOORBELL_DEVICE_NAME;
  doc["door_name"] = DOORBELL_DOOR_NAME;
  doc["floor_name"] = "";
  doc["in_or_out"] = "in";
  doc["mode"] = "webrtc";
  doc["create_time_uid"] = now;
  doc["create_time"] = now;
  doc["room_id"] = roomId;

  JsonArray viewers = doc["notify_door_guards"].to<JsonArray>();
  for (int i = 0; i < resolvedViewerCount; i++) {
    viewers.add(resolvedViewerIds[i]);
  }

  String body;
  serializeJson(doc, body);

  logPrintln("UniFi: Viewers in notify list: " + String(resolvedViewerCount));

  String path = "/proxy/access/api/v2/device/" + deviceId + "/remote_call";

  WiFiClientSecure apiClient;
  apiClient.setInsecure();
  apiClient.setTimeout(10000);

  if (!apiClient.connect(UNIFI_HOST, 443)) {
    logPrintln("UniFi: Connection failed");
    return false;
  }

  apiClient.println("POST " + path + " HTTP/1.1");
  apiClient.println("Host: " + String(UNIFI_HOST));
  apiClient.println("Content-Type: application/json");
  apiClient.println("Content-Length: " + String(body.length()));
  apiClient.println("X-Csrf-Token: " + csrfToken);
  apiClient.println("Cookie: TOKEN=" + sessionCookie);
  apiClient.println("Connection: close");
  apiClient.println();
  apiClient.print(body);

  String statusLine = apiClient.readStringUntil('\n');
  int statusCode = 0;
  int spaceIdx = statusLine.indexOf(' ');
  if (spaceIdx > 0) {
    int endIdx = statusLine.indexOf(' ', spaceIdx + 1);
    if (endIdx > 0) {
      statusCode = statusLine.substring(spaceIdx + 1, endIdx).toInt();
    }
  }

  while (apiClient.available()) {
    apiClient.read();
  }
  apiClient.stop();

  bool success = (statusCode >= 200 && statusCode < 300);
  if (success) {
    logPrintln("UniFi: Doorbell ring triggered");
  } else {
    logPrintln("UniFi: Trigger failed, status: " + String(statusCode));
  }

  return success;
}

// =============================================================================
// Helper Functions
// =============================================================================

String normalizeMAC(const String& mac) {
  String normalized = mac;
  normalized.replace(":", "");
  normalized.replace("-", "");
  normalized.toLowerCase();
  return normalized;
}

String generateRandomString(int length) {
  const char charset[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  String result = "";
  for (int i = 0; i < length; i++) {
    result += charset[random(0, sizeof(charset) - 1)];
  }
  return result;
}

String generateUUID() {
  String uuid = "";
  for (int i = 0; i < 32; i++) {
    if (i == 8 || i == 12 || i == 16 || i == 20) uuid += "-";
    uuid += String(random(0, 16), HEX);
  }
  return uuid;
}

// =============================================================================
// Internal HTTP Helper Functions
// =============================================================================

static String readHttpResponse(WiFiClientSecure& client) {
  String response = "";
  unsigned long timeout = millis() + 10000;

  while (millis() < timeout) {
    while (client.available()) {
      response += (char)client.read();
    }
    if (response.indexOf("\r\n\r\n") > 0 && !client.available()) {
      delay(100);
      while (client.available()) {
        response += (char)client.read();
      }
      break;
    }
    delay(10);
  }

  return response;
}

static int extractStatusCode(const String& response) {
  int spaceIdx = response.indexOf(' ');
  if (spaceIdx < 0) return 0;
  int endIdx = response.indexOf(' ', spaceIdx + 1);
  if (endIdx < 0) return 0;
  return response.substring(spaceIdx + 1, endIdx).toInt();
}

static String extractHeader(const String& response, const String& headerName) {
  String search = "\r\n" + headerName + ": ";
  int idx = response.indexOf(search);
  if (idx < 0) {
    String lowerResp = response;
    String lowerSearch = search;
    lowerResp.toLowerCase();
    lowerSearch.toLowerCase();
    idx = lowerResp.indexOf(lowerSearch);
  }
  if (idx < 0) return "";

  int start = idx + search.length();
  int end = response.indexOf("\r\n", start);
  if (end < 0) return "";

  return response.substring(start, end);
}

static String extractCookie(const String& response, const String& cookieName) {
  String search = cookieName + "=";
  int idx = response.indexOf(search);
  if (idx < 0) return "";

  int start = idx + search.length();
  int end = response.indexOf(";", start);
  if (end < 0) end = response.indexOf("\r\n", start);
  if (end < 0) return "";

  return response.substring(start, end);
}
