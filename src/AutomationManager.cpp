#include "AutomationManager.h"
#include <cmath>

AutomationManager::AutomationManager() 
    : _rulesPath("/automations.json"), _lastEvalTime(0) {
    _mutex = xSemaphoreCreateMutex();
}

AutomationManager::~AutomationManager() {
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

bool AutomationManager::begin(const char* rulesPath) {
    if (rulesPath && strlen(rulesPath) > 0) {
        _rulesPath = rulesPath;
    }
    return loadRules();
}

bool AutomationManager::loadRules() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _rules.clear();

    if (!LittleFS.exists(_rulesPath)) {
        Serial.printf("[AutomationManager] Fichier %s inexistant. Initialisation vide.\n", _rulesPath.c_str());
        xSemaphoreGive(_mutex);
        return true;
    }

    File f = LittleFS.open(_rulesPath, "r");
    if (!f) {
        Serial.printf("[AutomationManager] Impossible d'ouvrir %s en lecture.\n", _rulesPath.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(4096);
#endif
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[AutomationManager] Erreur désérialisation JSON : %s\n", err.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

    JsonArray array = doc["rules"].as<JsonArray>();
    for (JsonObject obj : array) {
        AutomationRule rule;
        rule.id = obj["id"] | 0;
        rule.enabled = obj["enabled"] | true;
        rule.triggerId = obj["triggerId"] | 0;
        rule.conditionValue = (const char*)(obj["conditionValue"] | "ON");
        rule.op = (const char*)(obj["operator"] | ">");
        rule.threshold = obj["threshold"] | 0.0f;
        rule.targetId = obj["targetId"] | 0;
        rule.actionValue = (const char*)(obj["actionValue"] | "ON");
        rule.actionPercent = obj["actionPercent"] | 100;
        _rules.push_back(rule);
    }

    Serial.printf("[AutomationManager] %u règles chargées depuis %s.\n", (unsigned int)_rules.size(), _rulesPath.c_str());
    xSemaphoreGive(_mutex);
    return true;
}

bool AutomationManager::saveRules(const String& jsonContent) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    File f = LittleFS.open(_rulesPath, "w");
    if (!f) {
        Serial.printf("[AutomationManager] Impossible d'ouvrir %s en écriture.\n", _rulesPath.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

    size_t written = f.print(jsonContent);
    f.close();
    xSemaphoreGive(_mutex);

    if (written > 0) {
        Serial.printf("[AutomationManager] %u octets écrits dans %s.\n", (unsigned int)written, _rulesPath.c_str());
        loadRules();
        return true;
    }
    return false;
}

String AutomationManager::getRulesJson() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (!LittleFS.exists(_rulesPath)) {
        xSemaphoreGive(_mutex);
        return "{\"rules\":[]}";
    }

    File f = LittleFS.open(_rulesPath, "r");
    if (!f) {
        xSemaphoreGive(_mutex);
        return "{\"rules\":[]}";
    }

    String content = f.readString();
    f.close();
    xSemaphoreGive(_mutex);
    return content.length() > 0 ? content : "{\"rules\":[]}";
}

void AutomationManager::update(DeviceManager& devManager) {
    unsigned long now = millis();
    if (now - _lastEvalTime < 500) {
        return; // Évaluation toutes les 500ms
    }
    _lastEvalTime = now;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    std::vector<AutomationRule> rulesCopy = _rules;
    xSemaphoreGive(_mutex);

    for (const auto& rule : rulesCopy) {
        if (!rule.enabled) continue;

        Device* trig = devManager.getDeviceById(rule.triggerId);
        Device* target = devManager.getDeviceById(rule.targetId);
        if (!trig || !target) continue;

        bool conditionMet = false;

        // Évaluation selon le mode du capteur source
        if (trig->mode == MODE_INPUT_ADC) {
            int raw = analogRead(trig->gpio);
            trig->value = raw;
            float volts = (raw / 4095.0f) * 3.3f;
            if (rule.op == "<") conditionMet = (volts < rule.threshold);
            else conditionMet = (volts > rule.threshold);
        } else if (trig->mode == MODE_OUTPUT_PWM) {
            float pct = (trig->value / 255.0f) * 100.0f;
            if (rule.op == "<") conditionMet = (pct < rule.threshold);
            else conditionMet = (pct > rule.threshold);
        } else if (trig->mode == MODE_INPUT_DIGITAL || trig->mode == MODE_INPUT_ONEWIRE) {
            // Lecture directe de la broche physique (contact sec avec INPUT_PULLUP)
            int pinVal = digitalRead(trig->gpio);
            // LOW = contact fermé = ON (1), HIGH = contact ouvert = OFF (0)
            uint8_t measuredState = (pinVal == LOW) ? 1 : 0;
            trig->state = measuredState;
            uint8_t desiredState = (rule.conditionValue == "ON") ? 1 : 0;
            conditionMet = (measuredState == desiredState);
        } else {
            // Déclencheur type Relais ou autre sortie binaire
            uint8_t desiredState = (rule.conditionValue == "ON") ? 1 : 0;
            conditionMet = (trig->state == desiredState);
        }

        // Si la condition est satisfaite, appliquer la commande à l'actionneur cible
        if (conditionMet) {
            if (target->mode == MODE_OUTPUT_PWM) {
                uint8_t desiredRaw = (uint8_t)round((rule.actionPercent / 100.0f) * 255.0f);
                if (target->value != desiredRaw) {
                    devManager.setDeviceState(target->id, (desiredRaw > 0) ? 1 : 0, desiredRaw);
                }
            } else {
                uint8_t desiredState = (rule.actionValue == "ON") ? 1 : 0;
                if (target->state != desiredState) {
                    devManager.setDeviceState(target->id, desiredState, 0);
                }
            }
        }
    }
}

