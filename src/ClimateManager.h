#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <functional>
#include "DeviceManager.h"

/**
 * @class ClimateManager
 * @brief Gestionnaire de climatisation autonome 24/24 pour ESP32
 * 
 * Assure la régulation thermique continue sur matériel réel (Sondes DS18B20 1-Wire & ADC1),
 * la protection frigorifique anti-court-cycle du compresseur (180s),
 * la surveillance de sécurité Watchdog (coupure d'urgence si sonde débranchée),
 * et la synchronisation temps réel via WebSockets.
 */
class ClimateManager {
public:
    using BroadcastCallback = std::function<void(const String& message)>;

    ClimateManager();
    ~ClimateManager();

    bool begin(const char* configPath = "/climate.json");
    bool loadConfig();
    bool saveConfig();

    /**
     * @brief Boucle principale de régulation appelée 24/24 dans loop()
     */
    void update(DeviceManager& devManager);

    // Commandes utilisateur
    void setPower(bool on);
    void setTarget(bool enabled, float temp);
    void setMode(const String& newMode);
    void setFanSpeed(uint8_t speed);
    void setHysteresis(float hyst);
    void setChiller(bool enabled);
    void setWaterTargetTemp(float temp);

    // Traitement des commandes JSON (WebSocket ou REST)
    bool handleJsonCommand(const String& jsonStr);

    // Sérialisation de l'état complet
    String getTelemetryJson();

    // Configuration du diffuseur WebSocket
    void setBroadcastCallback(BroadcastCallback cb);

    // Getters d'état
    bool isSystemOn() const { return _systemOn; }
    bool isTargetEnabled() const { return _targetEnabled; }
    float getTargetTemp() const { return _targetTemp; }
    float getAmbientTemp() const { return _currentAmbientTemp; }
    float getWaterTemp() const { return _currentWaterTemp; }
    float getWaterTargetTemp() const { return _targetWaterTemp; }
    bool isCompressorActive() const { return _compressorActive; }
    bool isAntiCycleActive() const { return _antiCycleActive; }
    uint16_t getAntiCycleRemainingSec() const { return _antiCycleRemainingSec; }
    uint8_t getProbesCount() const { return _probesConnectedCount; }
    bool isProbeWatchdogAlert() const { return _probeWatchdogAlert; }

    // Constante de sécurité frigorifique : 3 minutes (180 s)
    static const uint32_t ANTI_CYCLE_DELAY_MS = 180000;

private:
    String _configPath;
    SemaphoreHandle_t _mutex;
    BroadcastCallback _broadcastCb;

    // Gestion du bus 1-Wire et sondes Dallas DS18B20
    OneWire* _oneWire;
    DallasTemperature* _dallasSensors;
    int8_t _currentOneWirePin;
    uint8_t _probesConnectedCount;
    bool _probeWatchdogAlert;
    unsigned long _lastSensorReadTime;

    // Paramètres de fonctionnement
    bool _systemOn;
    bool _targetEnabled;
    float _targetTemp;
    float _hysteresis;
    String _mode;
    uint8_t _fanSpeed;
    bool _chillerEnabled;
    float _targetWaterTemp;

    // Protection compresseur (Anti-court-cycle)
    bool _compressorActive;
    bool _antiCycleActive;
    uint16_t _antiCycleRemainingSec;
    unsigned long _lastCompressorStopTime;

    // Températures réelles mesurées
    float _currentAmbientTemp;
    float _currentWaterTemp;

    // Métriques et chronométrage
    float _totalEnergyKwh;
    unsigned long _totalRuntimeSec;
    unsigned long _lastRegulTime;
    unsigned long _lastBroadcastTime;
    unsigned long _lastStatsTick;

    void initOrUpdate1Wire(uint8_t gpio);
    void readPhysicalSensors(DeviceManager& devManager);
    void evaluateRegulation(DeviceManager& devManager, float dtSec);
    void applyModePreset(const String& newMode);
    void broadcastState();
};
