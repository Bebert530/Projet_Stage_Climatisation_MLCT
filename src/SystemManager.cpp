#include "SystemManager.h"
#include "ClimateManager.h"

SystemManager::SystemManager() : _configPath("/systems.json") {
    _mutex = xSemaphoreCreateMutex();
}

SystemManager::~SystemManager() {
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

bool SystemManager::begin(const char* configPath) {
    if (configPath && strlen(configPath) > 0) {
        _configPath = configPath;
    }
    Serial.println("[SystemManager] Initialisation du gestionnaire de systèmes...");
    bool ok = loadConfig();
    if (!ok) {
        Serial.println("[SystemManager] Création de la configuration des systèmes par défaut.");
        createDefaultConfig();
        saveConfig();
    }
    return true;
}

void SystemManager::createDefaultConfig() {
    _systems.clear();
    SystemConfig clim;
    clim.id = "clim_main";
    clim.type = "climatisation";
    clim.name = "Climatisation Salon";
    clim.enabled = true;
    clim.targetTemp = 21.0f;
    clim.mode = "NORMAL";
    
    // Bindings par défaut vers les périphériques initiaux
    clim.bindings.tempAirId = 4;        // Sonde Température Air (1-Wire GPIO 19)
    clim.bindings.tempWaterId = 6;      // Sonde Température Eau (1-Wire GPIO 5)
    clim.bindings.fanPwmId = 2;         // Ventilateur Habitacle (PWM GPIO 21)
    clim.bindings.pumpRelayId = 1;      // Pompe boucle froide (Relais GPIO 4)
    clim.bindings.compressorRelayId = 5;// Compresseur Glacière (Relais GPIO 22)

    _systems.push_back(clim);
}

bool SystemManager::loadConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (!LittleFS.exists(_configPath)) {
        xSemaphoreGive(_mutex);
        Serial.printf("[SystemManager] %s introuvable.\n", _configPath.c_str());
        return false;
    }

    File f = LittleFS.open(_configPath, "r");
    if (!f) {
        xSemaphoreGive(_mutex);
        Serial.printf("[SystemManager] Erreur ouverture %s\n", _configPath.c_str());
        return false;
    }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(2048);
#endif
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        xSemaphoreGive(_mutex);
        Serial.printf("[SystemManager] Erreur parsing JSON: %s\n", err.c_str());
        return false;
    }

    _systems.clear();
    JsonArray arr = doc["systems"].as<JsonArray>();
    for (JsonObject obj : arr) {
        SystemConfig sys;
        sys.id = (const char*)(obj["id"] | "sys_unknown");
        sys.type = (const char*)(obj["type"] | "climatisation");
        sys.name = (const char*)(obj["name"] | "Système");
        sys.enabled = obj["enabled"] | true;

        if (obj["bindings"].is<JsonObject>()) {
            JsonObject b = obj["bindings"].as<JsonObject>();
            sys.bindings.tempAirId = b["temp_air_id"] | 0;
            sys.bindings.tempWaterId = b["temp_water_id"] | 0;
            sys.bindings.fanPwmId = b["fan_pwm_id"] | 0;
            sys.bindings.pumpRelayId = b["pump_relay_id"] | 0;
            sys.bindings.compressorRelayId = b["compressor_relay_id"] | 0;
        }

        if (obj["settings"].is<JsonObject>()) {
            JsonObject s = obj["settings"].as<JsonObject>();
            sys.targetTemp = s["target_temp"] | 21.0f;
            sys.mode = (const char*)(s["mode"] | "NORMAL");
        }

        _systems.push_back(sys);
    }

    xSemaphoreGive(_mutex);
    Serial.printf("[SystemManager] %u système(s) chargé(s) depuis %s\n", (unsigned int)_systems.size(), _configPath.c_str());
    return true;
}

bool SystemManager::saveConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(2048);
#endif

    JsonArray arr = doc["systems"].to<JsonArray>();
    for (const auto& sys : _systems) {
        JsonObject obj = arr.add<JsonObject>();
        obj["id"] = sys.id;
        obj["type"] = sys.type;
        obj["name"] = sys.name;
        obj["enabled"] = sys.enabled;

        JsonObject b = obj["bindings"].to<JsonObject>();
        if (sys.bindings.tempAirId > 0) b["temp_air_id"] = sys.bindings.tempAirId;
        else b["temp_air_id"] = nullptr;

        if (sys.bindings.tempWaterId > 0) b["temp_water_id"] = sys.bindings.tempWaterId;
        else b["temp_water_id"] = nullptr;

        if (sys.bindings.fanPwmId > 0) b["fan_pwm_id"] = sys.bindings.fanPwmId;
        else b["fan_pwm_id"] = nullptr;

        if (sys.bindings.pumpRelayId > 0) b["pump_relay_id"] = sys.bindings.pumpRelayId;
        else b["pump_relay_id"] = nullptr;

        if (sys.bindings.compressorRelayId > 0) b["compressor_relay_id"] = sys.bindings.compressorRelayId;
        else b["compressor_relay_id"] = nullptr;

        JsonObject s = obj["settings"].to<JsonObject>();
        s["target_temp"] = sys.targetTemp;
        s["mode"] = sys.mode;
    }

    File f = LittleFS.open(_configPath, "w");
    if (!f) {
        xSemaphoreGive(_mutex);
        Serial.printf("[SystemManager] Erreur écriture %s\n", _configPath.c_str());
        return false;
    }

    serializeJson(doc, f);
    f.close();
    xSemaphoreGive(_mutex);
    return true;
}

std::vector<SystemConfig> SystemManager::getSystems() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    std::vector<SystemConfig> copy = _systems;
    xSemaphoreGive(_mutex);
    return copy;
}

SystemConfig* SystemManager::getSystemById(const String& id) {
    for (auto& sys : _systems) {
        if (sys.id == id) return &sys;
    }
    return nullptr;
}

SystemConfig* SystemManager::getPrimaryClimateSystem() {
    for (auto& sys : _systems) {
        if (sys.type == "climatisation" && sys.enabled) {
            return &sys;
        }
    }
    // Si aucun n'est activé mais qu'un existe
    for (auto& sys : _systems) {
        if (sys.type == "climatisation") {
            return &sys;
        }
    }
    return nullptr;
}

bool SystemManager::saveSystem(const SystemConfig& sys) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool found = false;
    for (size_t i = 0; i < _systems.size(); ++i) {
        if (_systems[i].id == sys.id) {
            _systems[i] = sys;
            found = true;
            break;
        }
    }
    if (!found) {
        _systems.push_back(sys);
    }
    xSemaphoreGive(_mutex);
    return saveConfig();
}

bool SystemManager::deleteSystem(const String& id) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool removed = false;
    for (auto it = _systems.begin(); it != _systems.end(); ) {
        if (it->id == id) {
            it = _systems.erase(it);
            removed = true;
        } else {
            ++it;
        }
    }
    xSemaphoreGive(_mutex);
    if (removed) {
        saveConfig();
    }
    return removed;
}

bool SystemManager::bindDeviceToSlot(const String& systemId, const String& slotName, uint8_t deviceId) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    SystemConfig* sys = nullptr;
    for (auto& s : _systems) {
        if (s.id == systemId) {
            sys = &s;
            break;
        }
    }

    if (!sys) {
        xSemaphoreGive(_mutex);
        return false;
    }

    if (slotName == "temp_air_id" || slotName == "temp_air") {
        sys->bindings.tempAirId = deviceId;
    } else if (slotName == "temp_water_id" || slotName == "temp_water") {
        sys->bindings.tempWaterId = deviceId;
    } else if (slotName == "fan_pwm_id" || slotName == "fan_pwm") {
        sys->bindings.fanPwmId = deviceId;
    } else if (slotName == "pump_relay_id" || slotName == "pump_relay") {
        sys->bindings.pumpRelayId = deviceId;
    } else if (slotName == "compressor_relay_id" || slotName == "compressor_relay" || slotName == "compressor" || slotName == "compressor_id") {
        sys->bindings.compressorRelayId = deviceId;
    } else {
        xSemaphoreGive(_mutex);
        return false;
    }

    xSemaphoreGive(_mutex);
    return saveConfig();
}

bool SystemManager::isSystemOperational(const String& systemId, DeviceManager& devManager, std::vector<String>& missingSlots) {
    missingSlots.clear();
    xSemaphoreTake(_mutex, portMAX_DELAY);
    SystemConfig* sys = nullptr;
    for (auto& s : _systems) {
        if (s.id == systemId) {
            sys = &s;
            break;
        }
    }

    if (!sys) {
        missingSlots.push_back("system_not_found");
        xSemaphoreGive(_mutex);
        return false;
    }

    if (sys->type == "climatisation") {
        // Slot 1 : Sonde Air [Requis]
        if (sys->bindings.tempAirId == 0 || devManager.getDeviceById(sys->bindings.tempAirId) == nullptr) {
            missingSlots.push_back("temp_air_id");
        }

        // Slot 3 : Ventilateur PWM [Requis]
        if (sys->bindings.fanPwmId == 0 || devManager.getDeviceById(sys->bindings.fanPwmId) == nullptr) {
            missingSlots.push_back("fan_pwm_id");
        }

        // Slot 4 : Pompe Relais [Requis]
        if (sys->bindings.pumpRelayId == 0 || devManager.getDeviceById(sys->bindings.pumpRelayId) == nullptr) {
            missingSlots.push_back("pump_relay_id");
        }

        // Slot 5 : Compresseur Relais [Requis]
        if (sys->bindings.compressorRelayId == 0 || devManager.getDeviceById(sys->bindings.compressorRelayId) == nullptr) {
            missingSlots.push_back("compressor_relay_id");
        }

        // Slot 2 : Sonde Eau [Optionnel - vérifié si assigné]
        if (sys->bindings.tempWaterId > 0 && devManager.getDeviceById(sys->bindings.tempWaterId) == nullptr) {
            missingSlots.push_back("temp_water_id_invalid");
        }
    }

    bool operational = missingSlots.empty() && sys->enabled;
    xSemaphoreGive(_mutex);
    return operational;
}

String SystemManager::getSystemsJson(DeviceManager& devManager, ClimateManager* climManager) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(4096);
#endif

    JsonArray arr = doc["systems"].to<JsonArray>();
    for (const auto& sys : _systems) {
        JsonObject obj = arr.add<JsonObject>();
        obj["id"] = sys.id;
        obj["type"] = sys.type;
        obj["name"] = sys.name;
        obj["enabled"] = sys.enabled;

        JsonObject b = obj["bindings"].to<JsonObject>();
        if (sys.bindings.tempAirId > 0) b["temp_air_id"] = sys.bindings.tempAirId;
        else b["temp_air_id"] = nullptr;

        if (sys.bindings.tempWaterId > 0) b["temp_water_id"] = sys.bindings.tempWaterId;
        else b["temp_water_id"] = nullptr;

        if (sys.bindings.fanPwmId > 0) b["fan_pwm_id"] = sys.bindings.fanPwmId;
        else b["fan_pwm_id"] = nullptr;

        if (sys.bindings.pumpRelayId > 0) b["pump_relay_id"] = sys.bindings.pumpRelayId;
        else b["pump_relay_id"] = nullptr;

        if (sys.bindings.compressorRelayId > 0) b["compressor_relay_id"] = sys.bindings.compressorRelayId;
        else b["compressor_relay_id"] = nullptr;

        JsonObject s = obj["settings"].to<JsonObject>();
        s["target_temp"] = sys.targetTemp;
        s["mode"] = sys.mode;

        // Évaluation de complétude
        std::vector<String> missing;
        if (sys.type == "climatisation") {
            if (sys.bindings.tempAirId == 0 || devManager.getDeviceById(sys.bindings.tempAirId) == nullptr) {
                missing.push_back("temp_air_id");
            }
            if (sys.bindings.fanPwmId == 0 || devManager.getDeviceById(sys.bindings.fanPwmId) == nullptr) {
                missing.push_back("fan_pwm_id");
            }
            if (sys.bindings.pumpRelayId == 0 || devManager.getDeviceById(sys.bindings.pumpRelayId) == nullptr) {
                missing.push_back("pump_relay_id");
            }
            if (sys.bindings.compressorRelayId == 0 || devManager.getDeviceById(sys.bindings.compressorRelayId) == nullptr) {
                missing.push_back("compressor_relay_id");
            }
            if (sys.bindings.tempWaterId > 0 && devManager.getDeviceById(sys.bindings.tempWaterId) == nullptr) {
                missing.push_back("temp_water_id_invalid");
            }
        }

        obj["operational"] = missing.empty();
        JsonArray missArr = obj["missing_slots"].to<JsonArray>();
        for (const auto& m : missing) {
            missArr.add(m);
        }

        // Données du compresseur frigorifique
        JsonObject compObj = obj["compressor"].to<JsonObject>();
        Device* compDev = (sys.bindings.compressorRelayId > 0) ? devManager.getDeviceById(sys.bindings.compressorRelayId) : nullptr;
        
        if (climManager) {
            compObj["state"] = climManager->getCompressorStateString();
            compObj["mode"] = climManager->getCompressorModeString();
            compObj["remaining_delay_sec"] = climManager->getAntiCycleRemainingSec();
        } else {
            compObj["state"] = (compDev && compDev->state) ? "RUNNING" : "OFF";
            compObj["mode"] = "auto";
            compObj["remaining_delay_sec"] = 0;
        }
        
        if (compDev) {
            compObj["gpio"] = compDev->gpio;
        } else {
            compObj["gpio"] = nullptr;
        }
    }

    String output;
    serializeJson(doc, output);
    xSemaphoreGive(_mutex);
    return output;
}
