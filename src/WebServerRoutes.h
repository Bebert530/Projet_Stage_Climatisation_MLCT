#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "DeviceManager.h"
#include "AutomationManager.h"

/**
 * @brief Configure l'ensemble des routes REST et statiques pour le serveur web embarqué
 * @param server Référence vers le serveur AsyncWebServer
 * @param devManager Référence vers le gestionnaire de matériel
 * @param autoManager Référence vers le gestionnaire d'automatisation
 */
void setupWebServerRoutes(AsyncWebServer& server, DeviceManager& devManager, AutomationManager& autoManager);

