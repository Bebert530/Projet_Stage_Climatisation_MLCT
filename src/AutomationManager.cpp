#include "AutomationManager.h"
#include <cmath>

AutomationManager::AutomationManager() 
    : _rulesPath("/automations.json"), _evalTimer(500) {
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
    _evalTimer.start(500);
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

#include "ClimateManager.h"
#include <map>

void AutomationManager::update(DeviceManager& devManager, ClimateManager* climManager) {
    if (!_evalTimer.checkAndReset()) {
        return; // Évaluation toutes les 500ms
    }

    xSemaphoreTake(_mutex, portMAX_DELAY);
    std::vector<AutomationRule> rulesCopy = _rules;
    xSemaphoreGive(_mutex);

    // Structure pour collecter l'état attendu pour chaque actionneur cible
    struct TargetAction {
        bool hasMetRule = false;
        uint8_t desiredState = 0;
        uint8_t desiredPwm = 0;
    };
    std::map<uint8_t, TargetAction> targetActions;

    // Répertorier tous les actionneurs cibles présents dans les règles activées
    for (const auto& rule : rulesCopy) {
        if (!rule.enabled || rule.targetId == 0) continue;
        if (targetActions.find(rule.targetId) == targetActions.end()) {
            targetActions[rule.targetId] = TargetAction();
        }
    }

    for (const auto& rule : rulesCopy) {
        if (!rule.enabled) continue;

        Device* trig = devManager.getDeviceById(rule.triggerId);
        Device* target = devManager.getDeviceById(rule.targetId);
        if (!trig || !target) continue;

        bool conditionMet = false;

        // 1. Évaluation selon le mode du capteur source
        if (trig->mode == MODE_INPUT_ONEWIRE || trig->mode == MODE_INPUT_ADC_NTC) {
            float currentTemp = NAN;
            if (trig->value != 0) {
                currentTemp = trig->value / 100.0f;
            } else if (climManager && !isnan(climManager->getAmbientTemp())) {
                currentTemp = climManager->getAmbientTemp();
            }

            if (!isnan(currentTemp)) {
                if (rule.op == "<") {
                    conditionMet = (currentTemp < rule.threshold);
                } else if (rule.op == "=") {
                    conditionMet = (fabs(currentTemp - rule.threshold) < 0.5f);
                } else { // ">"
                    conditionMet = (currentTemp > rule.threshold);
                }
            } else {
                conditionMet = false;
            }
        } else if (trig->mode == MODE_INPUT_ADC) {
            float volts = (trig->value / 4095.0f) * 3.3f;
            if (rule.op == "<") {
                conditionMet = (volts < rule.threshold);
            } else if (rule.op == "=") {
                conditionMet = (fabs(volts - rule.threshold) < 0.1f);
            } else { // ">"
                conditionMet = (volts > rule.threshold);
            }
        } else if (trig->mode == MODE_OUTPUT_PWM) {
            float pct = (trig->value / 255.0f) * 100.0f;
            if (rule.op == "<") {
                conditionMet = (pct < rule.threshold);
            } else if (rule.op == "=") {
                conditionMet = (fabs(pct - rule.threshold) < 1.0f);
            } else { // ">"
                conditionMet = (pct > rule.threshold);
            }
        } else if (trig->mode == MODE_INPUT_DIGITAL) {
            uint8_t desiredState = (rule.conditionValue == "ON") ? 1 : 0;
            conditionMet = (trig->state == desiredState);
        } else {
            uint8_t desiredState = (rule.conditionValue == "ON") ? 1 : 0;
            conditionMet = (trig->state == desiredState);
        }

        if (conditionMet) {
            targetActions[rule.targetId].hasMetRule = true;
            if (target->mode == MODE_OUTPUT_PWM) {
                uint8_t pwm = (uint8_t)round((rule.actionPercent / 100.0f) * 255.0f);
                if (pwm >= targetActions[rule.targetId].desiredPwm) {
                    targetActions[rule.targetId].desiredPwm = pwm;
                    targetActions[rule.targetId].desiredState = (pwm > 0) ? 1 : 0;
                }
            } else {
                targetActions[rule.targetId].desiredState = (rule.actionValue == "ON") ? 1 : 0;
            }
        }
    }

    // 2. Application de l'état : activation si condition remplie, extinction si aucune règle n'ordonne la marche
    for (const auto& pair : targetActions) {
        uint8_t targetId = pair.first;
        const TargetAction& act = pair.second;
        Device* target = devManager.getDeviceById(targetId);
        if (!target) continue;

        if (act.hasMetRule) {
            if (target->mode == MODE_OUTPUT_PWM) {
                if (target->value != act.desiredPwm || target->state != act.desiredState) {
                    devManager.setDeviceState(target->id, act.desiredState, act.desiredPwm);
                }
            } else {
                if (target->state != act.desiredState) {
                    devManager.setDeviceState(target->id, act.desiredState, 0);
                }
            }
        } else {
            // Aucune règle active ne demande la marche de cet actionneur
            bool climRunning = (climManager && climManager->isSystemOn());
            if (!climRunning) {
                if (target->mode == MODE_OUTPUT_PWM) {
                    if (target->value != 0 || target->state != 0) {
                        devManager.setDeviceState(target->id, 0, 0);
                    }
                } else {
                    if (target->state != 0) {
                        devManager.setDeviceState(target->id, 0, 0);
                    }
                }
            }
        }
    }
}


