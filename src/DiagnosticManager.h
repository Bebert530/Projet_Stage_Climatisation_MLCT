#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <LittleFS.h>
#include <vector>
#include <map>
#include <time.h>
#include <sys/time.h>
#include "DeviceManager.h"
#include "SystemManager.h"
#include "ClimateManager.h"
#include "WiFiManager.h"

struct DiagLogEntry {
    uint32_t timestamp;   // Timestamp (Epoch si dispo, sinon Uptime en sec)
    bool isEpoch;         // true si timestamp UTC réel, false si temps uptime
    String level;         // "ALERTE", "INFO", "CRITIQUE", "RECOUVREMENT"
    String message;       // Description technique de l'événement
};

class DiagnosticManager {
public:
    DiagnosticManager();
    ~DiagnosticManager();

    /**
     * @brief Initialise le Watchdog matériel, charge l'historique des logs 48h et enregistre l'événement de démarrage
     * @param timeoutSeconds Délai avant redémarrage forcé si blocage (défaut 10s)
     * @param logPath Chemin du fichier d'historique 48h dans LittleFS
     */
    bool begin(uint32_t timeoutSeconds = 10, const char* logPath = "/diag_logs.json");

    /**
     * @brief Réinitialise le compteur du Task Watchdog (doit être appelé dans loop())
     */
    void feedWatchdog();

    /**
     * @brief Surveillance continue des transitions de panne capteurs, compresseur, RAM (appelé dans loop())
     */
    void update(DeviceManager& devMgr, SystemManager& sysMgr, ClimateManager& climMgr, WiFiManager& wifiMgr);

    /**
     * @brief Ajoute un événement horodaté dans le journal avec persistance 48h
     */
    void addLog(const String& level, const String& message);

    /**
     * @brief Synchronise l'horloge interne de l'ESP32 (depuis le navigateur ou NTP)
     */
    void syncTime(uint32_t epochSeconds);

    /**
     * @brief Charge les logs depuis LittleFS et purge les entrées de plus de 48h
     */
    bool loadLogs();

    /**
     * @brief Sauvegarde les logs valides dans LittleFS
     */
    bool saveLogs();

    /**
     * @brief Purge les logs dépassant 48 heures (172 800 secondes)
     */
    void pruneLogs();

    /**
     * @brief Efface manuellement le journal de diagnostic
     */
    void clearLogs();

    /**
     * @brief Génère le rapport JSON complet de diagnostic système incluant l'historique 48h
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

    static const uint32_t RETENTION_48H_SEC = 48UL * 3600UL; // 48 heures = 172 800 s
    static const size_t MAX_LOG_ENTRIES = 80;

private:
    uint32_t _wdtTimeoutSeconds;
    bool _wdtEnabled;
    esp_reset_reason_t _resetReason;
    String _logPath;
    std::vector<DiagLogEntry> _logs;

    // Suivi d'état pour détection des transitions (fronts montants / descendants)
    std::map<int, bool> _sensorOkMap;
    bool _lastAntiCycleActive;
    bool _lastHeapLow;
    bool _lastStaConnected;
    uint32_t _lastCheckMs;
    uint32_t _bootEpoch;

    uint32_t getCurrentTimestamp(bool& outIsEpoch);
};
