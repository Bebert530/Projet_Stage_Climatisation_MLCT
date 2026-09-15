#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "DeviceManager.h"
#include "AutomationManager.h"
#include "ClimateManager.h"
#include "WiFiManager.h"

/**
 * @brief Configure l'ensemble des routes REST, WebSockets et statiques pour le serveur web embarqué
 * @param server Référence vers le serveur AsyncWebServer
 * @param devManager Référence vers le gestionnaire de matériel
 * @param autoManager Référence vers le gestionnaire d'automatisation
 * @param climManager Référence vers le gestionnaire de climatisation 24/24
 * @param wifiManager Référence vers le gestionnaire de Wi-Fi hybride
 */
void setupWebServerRoutes(AsyncWebServer& server, DeviceManager& devManager, AutomationManager& autoManager, ClimateManager& climManager, WiFiManager& wifiManager);
