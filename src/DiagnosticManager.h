#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <LittleFS.h>
#include "DeviceManager.h"
#include "SystemManager.h"
#include "ClimateManager.h"
#include "WiFiManager.h"

class DiagnosticManager {
public:
    DiagnosticManager();
    ~DiagnosticManager();

    /**
     * @brief Initialise le Watchdog matériel et enregistre la cause du démarrage
     * @param timeoutSeconds Délai avant redémarrage forcé si blocage (défaut 10s)
     */
    bool begin(uint32_t timeoutSeconds = 10);

    /**
     * @brief Réinitialise le compteur du Task Watchdog (doit être appelé dans loop())
     */
    void feedWatchdog();

    /**
     * @brief Génère le rapport JSON complet de diagnostic système
     */
    String getDiagnosticsJson(DeviceManager& devMgr, SystemManager& sysMgr, ClimateManager& climMgr, WiFiManager& wifiMgr);

    /**
     * @brief Retourne la raison lisible du dernier redémarrage de l'ESP32
     */
    String getResetReasonString() const;

    /**
     * @brief Déclenche un redémarrage logiciel propre de l'ESP32
     */
    void restartSystem();

    uint32_t getWdtTimeoutSeconds() const { return _wdtTimeoutSeconds; }
    bool isWdtEnabled() const { return _wdtEnabled; }

private:
    uint32_t _wdtTimeoutSeconds;
    bool _wdtEnabled;
    esp_reset_reason_t _resetReason;
};
