#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <vector>
#include "TimerUtil.h"
#include "DeviceManager.h"

class ClimateManager; // Déclaration anticipée

/**
 * @struct AutomationRule
 * @brief Représentation d'une règle d'automatisation (SI ... EST ... ALORS ...)
 */
struct AutomationRule {
    uint8_t id;             // Identifiant unique de la règle
    bool enabled;           // Règle activée ou désactivée
    uint8_t triggerId;      // ID de l'équipement déclencheur (source)
    String conditionValue;  // "ON" ou "OFF" pour Tout-ou-Rien
    String op;              // "<", ">", "=" pour analogique / PWM / température
    float threshold;        // Seuil numérique (°C, Volts, %, etc.)
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
     * @param climManager Pointeur optionnel vers ClimateManager pour les températures en direct
     */
    void update(DeviceManager& devManager, ClimateManager* climManager = nullptr);

private:
    String _rulesPath;
    std::vector<AutomationRule> _rules;
    SemaphoreHandle_t _mutex;
    NonBlockingTimer _evalTimer;
};


