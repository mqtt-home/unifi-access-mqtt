#pragma once

#include <Arduino.h>

// Session state (accessible from main)
extern String csrfToken;
extern String sessionCookie;
extern String userId;
extern String userName;
extern bool isLoggedIn;

// Resolved device IDs
extern String resolvedDoorbellDeviceId;
extern String resolvedViewerIds[4];
extern int resolvedViewerCount;

// API functions
bool unifiLogin();
bool unifiBootstrap();
bool unifiDismissCall(const String& deviceId, const String& requestId);
bool unifiTriggerRing();

// Helper functions
String normalizeMAC(const String& mac);
String generateRandomString(int length);
String generateUUID();
