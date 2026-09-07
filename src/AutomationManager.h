#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <vector>
#include "DeviceManager.h"

/**
 * @struct AutomationRule
 * @brief Représentation d'une règle d'automatisation (SI ... EST ... ALORS ...)
 */
struct AutomationRule {
    uint8_t id;             // Identifiant unique de la règle
    bool enabled;           // Règle activée ou désactivée
    uint8_t triggerId;      // ID de l'équipement déclencheur (source)
    String conditionValue;  // "ON" ou "OFF" pour Tout-ou-Rien
    String op;              // "<", ">", "=" pour analogique / PWM
    float threshold;        // Seuil numérique pour analogique (Volts, %, etc.)
    uint8_t targetId;       // ID de l'équipement cible (actionneur)
    String actionValue;     // "ON" ou "OFF" pour relais
    uint8_t actionPercent;  // 0 à 100% pour variateur PWM
};

/**
 * @class AutomationManager
 * @brief Moteur d'évaluation et de persistance des règles d'automatisation
 */
class AutomationManager {
public:
    AutomationManager();
    ~AutomationManager();

    bool begin(const char* rulesPath = "/automations.json");
    bool loadRules();
    bool saveRules(const String& jsonContent);
    String getRulesJson();

    /**
     * @brief Évalue périodiquement les règles actives et pilote les équipements
     * @param devManager Référence vers le DeviceManager
     */
    void update(DeviceManager& devManager);

private:
    String _rulesPath;
    std::vector<AutomationRule> _rules;
    SemaphoreHandle_t _mutex;
    unsigned long _lastEvalTime;
};

