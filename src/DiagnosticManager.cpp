#include "DiagnosticManager.h"

DiagnosticManager::DiagnosticManager()
    : _wdtTimeoutSeconds(10), _wdtEnabled(false), _resetReason(ESP_RST_UNKNOWN) {}

DiagnosticManager::~DiagnosticManager() {}

bool DiagnosticManager::begin(uint32_t timeoutSeconds) {
    _wdtTimeoutSeconds = timeoutSeconds;
    _resetReason = esp_reset_reason();

    Serial.println("\n[DiagnosticManager] ========================================");
    Serial.printf("[DiagnosticManager] Cause du dernier démarrage : %s\n", getResetReasonString().c_str());

    // Initialisation du Task Watchdog Timer (TWDT)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms = _wdtTimeoutSeconds * 1000,
        .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
        .trigger_panic = true
    };
    esp_err_t err = esp_task_wdt_init(&wdt_config);
    if (err == ESP_OK) {
        esp_task_wdt_add(NULL); // Thread courant
        _wdtEnabled = true;
        Serial.printf("[DiagnosticManager] Watchdog matériel activé (Timeout: %d secondes).\n", _wdtTimeoutSeconds);
    } else {
        Serial.printf("[DiagnosticManager] Avertissement : Échec init Watchdog (err %d).\n", err);
    }
#else
    esp_err_t err = esp_task_wdt_init(_wdtTimeoutSeconds, true);
    if (err == ESP_OK) {
        esp_task_wdt_add(NULL);
        _wdtEnabled = true;
        Serial.printf("[DiagnosticManager] Watchdog matériel activé (Timeout: %d secondes).\n", _wdtTimeoutSeconds);
    } else {
        Serial.printf("[DiagnosticManager] Avertissement : Échec init Watchdog (err %d).\n", err);
    }
#endif

    Serial.println("[DiagnosticManager] ========================================\n");
    return _wdtEnabled;
}

void DiagnosticManager::feedWatchdog() {
    if (_wdtEnabled) {
        esp_task_wdt_reset();
    }
}

String DiagnosticManager::getResetReasonString() const {
    switch (_resetReason) {
        case ESP_RST_POWERON:   return "Mise sous tension normale (Power-On)";
        case ESP_RST_EXT:       return "Bouton Reset externe (Pin Reset)";
        case ESP_RST_SW:        return "Redémarrage logiciel demandé (Software Restart)";
        case ESP_RST_PANIC:     return "Panique noyau / Crash logiciel (Core Dump)";
        case ESP_RST_INT_WDT:   return "Watchdog Interrupt déclenché (Auto-Recovery)";
        case ESP_RST_TASK_WDT:  return "Task Watchdog Timer déclenché (Boucle bloquée > 10s)";
        case ESP_RST_WDT:       return "Watchdog Timer matériel déclenché";
        case ESP_RST_DEEPSLEEP: return "Sortie de veille profonde (Deep Sleep)";
        case ESP_RST_BROWNOUT:  return "Baisse de tension critique détectée (Brownout 12V/5V)";
        case ESP_RST_SDIO:      return "Réinitialisation SDIO";
        default:                return "Démarrage normal";
    }
}

void DiagnosticManager::restartSystem() {
    Serial.println("[DiagnosticManager] Redémarrage immédiat de l'ESP32 demandé...");
    delay(200);
    ESP.restart();
}

String DiagnosticManager::getDiagnosticsJson(DeviceManager& devMgr, SystemManager& sysMgr, ClimateManager& climMgr, WiFiManager& wifiMgr) {
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(4096);
#endif

    // 1. Matériel & Processeur ESP32
    JsonObject sys = doc["system"].to<JsonObject>();
    uint32_t uptimeSec = millis() / 1000;
    sys["uptime_sec"] = uptimeSec;
    
    char uptimeBuf[48];
    uint32_t d = uptimeSec / 86400;
    uint32_t h = (uptimeSec % 86400) / 3600;
    uint32_t m = (uptimeSec % 3600) / 60;
    uint32_t s = uptimeSec % 60;
    if (d > 0) {
        snprintf(uptimeBuf, sizeof(uptimeBuf), "%ud %uh %umin %us", d, h, m, s);
    } else if (h > 0) {
        snprintf(uptimeBuf, sizeof(uptimeBuf), "%uh %umin %us", h, m, s);
    } else {
        snprintf(uptimeBuf, sizeof(uptimeBuf), "%umin %us", m, s);
    }
    sys["uptime_human"] = String(uptimeBuf);

    sys["free_heap"] = ESP.getFreeHeap();
    sys["min_free_heap"] = ESP.getMinFreeHeap();
    sys["heap_size"] = ESP.getHeapSize();
    sys["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
    sys["chip_model"] = ESP.getChipModel();
    sys["chip_revision"] = ESP.getChipRevision();
    sys["reset_reason"] = getResetReasonString();
    sys["reset_reason_code"] = (int)_resetReason;
    sys["wdt_enabled"] = _wdtEnabled;
    sys["wdt_timeout_sec"] = _wdtTimeoutSeconds;

    // 2. Stockage LittleFS
    JsonObject fs = doc["storage"].to<JsonObject>();
    size_t totalBytes = LittleFS.totalBytes();
    size_t usedBytes = LittleFS.usedBytes();
    fs["total_bytes"] = totalBytes;
    fs["used_bytes"] = usedBytes;
    fs["free_bytes"] = (totalBytes > usedBytes) ? (totalBytes - usedBytes) : 0;
    fs["used_percent"] = (totalBytes > 0) ? (int)((usedBytes * 100) / totalBytes) : 0;

    JsonObject files = fs["files"].to<JsonObject>();
    files["config.json"] = LittleFS.exists("/config.json");
    files["climate.json"] = LittleFS.exists("/climate.json");
    files["systems.json"] = LittleFS.exists("/systems.json");
    files["automations.json"] = LittleFS.exists("/automations.json");
    files["wifi.json"] = LittleFS.exists("/wifi.json");

    // 3. Réseau & Wi-Fi
    JsonObject net = doc["network"].to<JsonObject>();
    net["ap_ssid"] = wifiMgr.getApSSID();
    net["ap_ip"] = wifiMgr.getApIP();
    net["ap_clients"] = WiFi.softAPgetStationNum();
    net["sta_configured"] = wifiMgr.isConfigured();
    net["sta_connected"] = wifiMgr.isStaConnected();
    net["sta_ssid"] = wifiMgr.getStaSSID();
    net["sta_ip"] = wifiMgr.getStaIP();
    net["sta_rssi"] = wifiMgr.getStaRSSI();

    // 4. Capteurs & Actionneurs
    JsonArray sensorsArr = doc["sensors"].to<JsonArray>();
    JsonArray actuatorsArr = doc["actuators"].to<JsonArray>();
    JsonArray healthMsgs = doc["health_messages"].to<JsonArray>();

    bool hasSensorIssue = false;
    bool hasCriticalIssue = false;

    std::vector<Device> devs = devMgr.getDevices();
    for (const auto& d : devs) {
        if (d.category == CAT_SENSOR) {
            JsonObject sObj = sensorsArr.add<JsonObject>();
            sObj["id"] = d.id;
            sObj["name"] = d.name;
            sObj["gpio"] = d.gpio;
            sObj["mode"] = DeviceManager::signalModeToString(d.mode);
            sObj["state"] = d.state;
            
            float valFloat = (d.mode == MODE_INPUT_ONEWIRE || d.mode == MODE_INPUT_ADC_NTC) 
                             ? (d.value / 100.0f) : (float)d.value;
            sObj["value"] = valFloat;

            if (d.state == 0 || (d.mode == MODE_INPUT_ONEWIRE && (d.value <= -5000 || d.value >= 12500 || d.value == 0))) {
                sObj["status"] = "DISCONNECTED";
                hasSensorIssue = true;
                healthMsgs.add("⚠️ " + d.name + " (GPIO " + String(d.gpio) + ") : Non connectée ou débranchée.");
            } else {
                sObj["status"] = "OK";
                healthMsgs.add("✅ " + d.name + " (GPIO " + String(d.gpio) + ") : Opérationnelle (" + String(valFloat, 1) + " °C)");
            }
        } else {
            JsonObject aObj = actuatorsArr.add<JsonObject>();
            aObj["id"] = d.id;
            aObj["name"] = d.name;
            aObj["gpio"] = d.gpio;
            aObj["mode"] = DeviceManager::signalModeToString(d.mode);
            aObj["state"] = d.state;
            aObj["value"] = d.value;
            aObj["status"] = "READY";
        }
    }

    // 5. Régulation & Sécurité Climatisation
    JsonObject clim = doc["climate"].to<JsonObject>();
    clim["system_on"] = climMgr.isSystemOn();
    clim["target_enabled"] = climMgr.isTargetEnabled();
    clim["target_temp"] = climMgr.getTargetTemp();
    clim["compressor_mode"] = climMgr.getCompressorModeString();
    clim["compressor_running"] = climMgr.isCompressorActive();
    clim["anti_short_cycle_active"] = climMgr.isAntiCycleActive();
    clim["anti_short_cycle_remaining_sec"] = climMgr.getAntiCycleRemainingSec();
    clim["cooling_demand"] = climMgr.isCoolingDemand();

    if (climMgr.isAntiCycleActive()) {
        healthMsgs.add("ℹ️ Sécurité Compresseur : Temporisation anti-court-cycle active (" + String(climMgr.getAntiCycleRemainingSec()) + "s)");
    }

    // 6. Évaluation de la santé globale
    if (ESP.getFreeHeap() < 20000) {
        hasCriticalIssue = true;
        healthMsgs.add("🛑 Mémoire vive critique : " + String(ESP.getFreeHeap()) + " octets libres.");
    }

    if (hasCriticalIssue) {
        doc["overall_health"] = "CRITICAL";
    } else if (hasSensorIssue) {
        doc["overall_health"] = "WARNING";
    } else {
        doc["overall_health"] = "OPTIMAL";
    }

    String output;
    serializeJson(doc, output);
    return output;
}
