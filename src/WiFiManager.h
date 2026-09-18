#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

enum WiFiStaState {
    STA_STATE_IDLE,
    STA_STATE_CONNECTING,
    STA_STATE_CONNECTED,
    STA_STATE_DISCONNECTED,
    STA_STATE_FAILED
};

class WiFiManager {
public:
    WiFiManager();
    ~WiFiManager();

    bool begin(const char* configPath = "/wifi.json");
    void update();

    // Endpoints API
    String getStatusJson();
    String getScanResultsJson();
    bool startScan();
    bool connectSTA(const String& ssid, const String& pass);
    bool resetSTA();

    // Getters
    bool isStaConnected() const;
    String getStaSSID() const;
    String getStaIP() const;
    int8_t getStaRSSI() const;
    String getApSSID() const;
    String getApIP() const;
    bool isConfigured() const;

private:
    String _configPath;
    String _staSSID;
    String _staPass;
    String _apSSID;
    String _apPass;
    
    IPAddress _apIP;
    IPAddress _apGateway;
    IPAddress _apSubnet;

    WiFiStaState _staState;
    bool _isConfigured;
    bool _isScanning;
    bool _pendingConnect;
    unsigned long _pendingConnectTime;
    unsigned long _lastReconnectAttempt;
    unsigned long _connectingStartTime;
    uint8_t _reconnectAttempts;

    SemaphoreHandle_t _mutex;

    void setupAP();
    void setupMDNS();
    void setupEvents();
    bool loadConfig();
    bool saveConfig();
    void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
};

