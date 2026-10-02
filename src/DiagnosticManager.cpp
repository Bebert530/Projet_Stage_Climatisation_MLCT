#include "DiagnosticManager.h"

DiagnosticManager::DiagnosticManager()
    : _wdtTimeoutSeconds(10),
      _wdtEnabled(false),
      _resetReason(ESP_RST_UNKNOWN),
      _logPath("/diag_logs.json"),
      _lastAntiCycleActive(false),
      _lastHeapLow(false),
      _lastStaConnected(false),
      _lastCheckMs(0),
      _bootEpoch(0) {}

DiagnosticManager::~DiagnosticManager() {}

uint32_t DiagnosticManager::getCurrentTimestamp(bool& outIsEpoch) {
    time_t now = time(nullptr);
    if (now > 1600000000) { // Horloge réelle synchronisée (NTP ou navigateur)
        outIsEpoch = true;
        return (uint32_t)now;
    }
    outIsEpoch = false;
    return (uint32_t)(millis() / 1000);
}

void DiagnosticManager::syncTime(uint32_t epochSeconds) {
    if (epochSeconds > 1600000000) {
        time_t current = time(nullptr);
        if (current < 1600000000 || abs((long)(epochSeconds - current)) > 10) {
            struct timeval tv = { .tv_sec = (time_t)epochSeconds, .tv_usec = 0 };
            settimeofday(&tv, NULL);
            _bootEpoch = epochSeconds - (millis() / 1000);
            Serial.printf("[DiagnosticManager] Horloge interne synchronisée : %lu (UTC)\n", (unsigned long)epochSeconds);
            
            // Mise à jour des logs antérieurs qui n'avaient que le temps uptime
            for (auto& log : _logs) {
                if (!log.isEpoch && _bootEpoch > 0) {
                    log.timestamp = _bootEpoch + log.timestamp;
                    log.isEpoch = true;
                }
            }
            saveLogs();
        }
    }
}

bool DiagnosticManager::begin(uint32_t timeoutSeconds, const char* logPath) {
    _wdtTimeoutSeconds = timeoutSeconds;
    _logPath = logPath ? logPath : "/diag_logs.json";
    _resetReason = esp_reset_reason();

    Serial.println("\n[DiagnosticManager] ========================================");
    Serial.printf("[DiagnosticManager] Cause du dernier démarrage : %s\n", getResetReasonString().c_str());

    // 1. Initialisation du Task Watchdog Timer (TWDT)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms = _wdtTimeoutSeconds * 1000,
        .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
        .trigger_panic = true
    };
    esp_err_t err = esp_task_wdt_init(&wdt_config);
    if (err == ESP_OK) {
        esp_task_wdt_add(NULL);
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

    // 2. Chargement de l'historique persistant des événements (48h)
    loadLogs();

    // 3. Enregistrement automatique de l'événement de démarrage
    String bootMsg = "Démarrage du système : " + getResetReasonString() + ".";
    addLog("INFO", bootMsg);

    Serial.println("[DiagnosticManager] ========================================\n");
    return _wdtEnabled;
}

void DiagnosticManager::feedWatchdog() {
    if (_wdtEnabled) {
        esp_task_wdt_reset();
    }
}

void DiagnosticManager::pruneLogs() {
    bool isEpoch = false;
    uint32_t now = getCurrentTimestamp(isEpoch);

    std::vector<DiagLogEntry> validLogs;
    for (const auto& log : _logs) {
        if (log.isEpoch && isEpoch) {
            if (now >= log.timestamp && (now - log.timestamp) <= RETENTION_48H_SEC) {
                validLogs.push_back(log);
            }
        } else {
            // Logs récents sous temps uptime
            validLogs.push_back(log);
        }
    }

    // Limiter la taille maximale pour préserver la mémoire et le temps d'écriture
    if (validLogs.size() > MAX_LOG_ENTRIES) {
        size_t toRemove = validLogs.size() - MAX_LOG_ENTRIES;
        validLogs.erase(validLogs.begin(), validLogs.begin() + toRemove);
    }

    _logs = validLogs;
}

bool DiagnosticManager::loadLogs() {
    _logs.clear();
    if (!LittleFS.exists(_logPath)) {
        return false;
    }

    File f = LittleFS.open(_logPath, "r");
    if (!f) return false;

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(8192);
#endif
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[DiagnosticManager] Erreur lecture logs (%s). Fichier réinitialisé.\n", err.c_str());
        return false;
    }

    JsonArray arr = doc["logs"].as<JsonArray>();
    for (JsonObject obj : arr) {
        DiagLogEntry entry;
        entry.timestamp = obj["ts"] | 0;
        entry.isEpoch = obj["epoch"] | false;
        entry.level = obj["lvl"] | "INFO";
        entry.message = obj["msg"] | "";
        if (entry.message.length() > 0) {
            _logs.push_back(entry);
        }
    }

    pruneLogs();
    Serial.printf("[DiagnosticManager] %u événements de diagnostic chargés (historique 48h).\n", _logs.size());
    return true;
}

bool DiagnosticManager::saveLogs() {
    pruneLogs();

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(8192);
#endif
    JsonArray arr = doc["logs"].to<JsonArray>();
    for (const auto& log : _logs) {
        JsonObject obj = arr.add<JsonObject>();
        obj["ts"] = log.timestamp;
        obj["epoch"] = log.isEpoch;
        obj["lvl"] = log.level;
        obj["msg"] = log.message;
    }

    File f = LittleFS.open(_logPath, "w");
    if (!f) {
        Serial.println("[DiagnosticManager] Échec ouverture LittleFS pour sauvegarde logs.");
        return false;
    }

    serializeJson(doc, f);
    f.close();
    return true;
}

void DiagnosticManager::addLog(const String& level, const String& message) {
    bool isEpoch = false;
    uint32_t ts = getCurrentTimestamp(isEpoch);

    // Éviter d'ajouter des doublons consécutifs identiques
    if (!_logs.empty()) {
        const auto& last = _logs.back();
        if (last.message == message && last.level == level && (ts - last.timestamp) < 3) {
            return;
        }
    }

    DiagLogEntry entry;
    entry.timestamp = ts;
    entry.isEpoch = isEpoch;
    entry.level = level;
    entry.message = message;

    _logs.push_back(entry);
    saveLogs();

    Serial.printf("[DIAG] [%s] %s\n", level.c_str(), message.c_str());
}

void DiagnosticManager::clearLogs() {
    _logs.clear();
    saveLogs();
}

void DiagnosticManager::update(DeviceManager& devMgr, SystemManager& sysMgr, ClimateManager& climMgr, WiFiManager& wifiMgr) {
    uint32_t nowMs = millis();
    if (nowMs - _lastCheckMs < 1000) return; // Exécution toutes les 1s
    _lastCheckMs = nowMs;

    // 1. Surveillance des capteurs (Déconnexions & Rétablissements)
    std::vector<Device> devs = devMgr.getDevices();
    for (const auto& d : devs) {
        if (d.category == CAT_SENSOR) {
            bool isOk = true;
            if (d.mode == MODE_INPUT_ONEWIRE) {
                if (d.state == 0 || d.value <= -5000 || d.value >= 12500) {
                    isOk = false;
                }
            } else if (d.mode == MODE_INPUT_ADC_NTC) {
                if (d.state == 0) {
                    isOk = false;
                }
            }

            bool hadPrev = (_sensorOkMap.find(d.id) != _sensorOkMap.end());
            bool prevOk = hadPrev ? _sensorOkMap[d.id] : true;

            if (!isOk && (prevOk || !hadPrev)) {
                // Déconnexion détectée !
                addLog("ALERTE", "Sonde \"" + d.name + "\" (GPIO " + String(d.gpio) + ") : Signal absent ou sonde déconnectée.");
                _sensorOkMap[d.id] = false;
            } else if (isOk && hadPrev && !prevOk) {
                // Rétablissement détecté !
                float valFloat = (d.mode == MODE_INPUT_ONEWIRE || d.mode == MODE_INPUT_ADC_NTC) 
                                 ? (d.value / 100.0f) : (float)d.value;
                addLog("RECOUVREMENT", "Sonde \"" + d.name + "\" (GPIO " + String(d.gpio) + ") : Signal rétabli (" + String(valFloat, 1) + " °C).");
                _sensorOkMap[d.id] = true;
            } else if (!hadPrev) {
                _sensorOkMap[d.id] = isOk;
            }
        }
    }

    // 2. Surveillance de la sécurité compresseur
    bool antiCycleNow = climMgr.isAntiCycleActive();
    if (antiCycleNow && !_lastAntiCycleActive) {
        addLog("INFO", "Sécurité Compresseur : Temporisation anti-court-cycle engagée (30 min de repos).");
        _lastAntiCycleActive = true;
    } else if (!antiCycleNow && _lastAntiCycleActive) {
        addLog("INFO", "Sécurité Compresseur : Temporisation achevée. Prêt pour nouveau cycle.");
        _lastAntiCycleActive = false;
    }

    // 3. Surveillance de la mémoire vive
    bool heapLowNow = (ESP.getFreeHeap() < 20000);
    if (heapLowNow && !_lastHeapLow) {
        addLog("CRITIQUE", "Mémoire RAM disponible faible (" + String(ESP.getFreeHeap()) + " octets).");
        _lastHeapLow = true;
    } else if (!heapLowNow && _lastHeapLow) {
        addLog("INFO", "Mémoire RAM stabilisée (" + String(ESP.getFreeHeap()) + " octets libres).");
        _lastHeapLow = false;
    }

    // 4. Surveillance de la connexion Wi-Fi Station
    bool staNow = wifiMgr.isStaConnected();
    if (staNow && !_lastStaConnected) {
        addLog("INFO", "Wi-Fi Station : Connecté au réseau \"" + wifiMgr.getStaSSID() + "\" (IP: " + wifiMgr.getStaIP() + ").");
        _lastStaConnected = true;
    } else if (!staNow && _lastStaConnected) {
        addLog("ALERTE", "Wi-Fi Station : Déconnexion du réseau Wi-Fi.");
        _lastStaConnected = false;
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
    addLog("INFO", "Redémarrage logiciel de l'ESP32 déclenché par l'utilisateur.");
    delay(200);
    ESP.restart();
}

String DiagnosticManager::getDiagnosticsJson(DeviceManager& devMgr, SystemManager& sysMgr, ClimateManager& climMgr, WiFiManager& wifiMgr) {
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(12288);
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

    bool isEpoch = false;
    sys["current_epoch"] = getCurrentTimestamp(isEpoch);
    sys["is_epoch_synced"] = isEpoch;

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
    net["ap_active"] = wifiMgr.isApActive();
    net["ap_ssid"] = wifiMgr.getApSSID();
    net["ap_ip"] = wifiMgr.getApIP();
    net["ap_clients"] = wifiMgr.isApActive() ? WiFi.softAPgetStationNum() : 0;
    net["sta_configured"] = wifiMgr.isConfigured();
    net["sta_connected"] = wifiMgr.isStaConnected();
    net["sta_ssid"] = wifiMgr.getStaSSID();
    net["sta_ip"] = wifiMgr.getStaIP();
    net["sta_rssi"] = wifiMgr.getStaRSSI();

    // 4. Régulation & Sécurité Climatisation
    JsonObject clim = doc["climate"].to<JsonObject>();
    clim["system_on"] = climMgr.isSystemOn();
    clim["target_enabled"] = climMgr.isTargetEnabled();
    clim["target_temp"] = climMgr.getTargetTemp();
    clim["compressor_mode"] = climMgr.getCompressorModeString();
    clim["compressor_running"] = climMgr.isCompressorActive();
    clim["anti_short_cycle_active"] = climMgr.isAntiCycleActive();
    clim["anti_short_cycle_remaining_sec"] = climMgr.getAntiCycleRemainingSec();
    clim["cooling_demand"] = climMgr.isCoolingDemand();

    // 5. Santé globale calculée
    bool hasSensorIssue = false;
    std::vector<Device> devs = devMgr.getDevices();
    for (const auto& d : devs) {
        if (d.category == CAT_SENSOR) {
            if (d.mode == MODE_INPUT_ONEWIRE) {
                if (d.state == 0 || d.value <= -5000 || d.value >= 12500) {
                    hasSensorIssue = true;
                    break;
                }
            } else if (d.mode == MODE_INPUT_ADC_NTC) {
                if (d.state == 0) {
                    hasSensorIssue = true;
                    break;
                }
            }
        }
    }

    if (ESP.getFreeHeap() < 20000) {
        doc["overall_health"] = "CRITICAL";
    } else if (hasSensorIssue) {
        doc["overall_health"] = "WARNING";
    } else {
        doc["overall_health"] = "OPTIMAL";
    }

    // 6. Historique persistant des événements (48h)
    JsonArray logsArr = doc["logs"].to<JsonArray>();
    // On renvoie les logs du plus récent au plus ancien
    for (int i = (int)_logs.size() - 1; i >= 0; i--) {
        JsonObject lObj = logsArr.add<JsonObject>();
        lObj["ts"] = _logs[i].timestamp;
        lObj["epoch"] = _logs[i].isEpoch;
        lObj["lvl"] = _logs[i].level;
        lObj["msg"] = _logs[i].message;
    }

    String output;
    serializeJson(doc, output);
    return output;
}
