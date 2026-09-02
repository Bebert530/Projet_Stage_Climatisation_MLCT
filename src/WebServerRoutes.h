#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "DeviceManager.h"

/**
 * @brief Configure l'ensemble des routes REST et statiques pour le serveur web embarqué
 * @param server Référence vers le serveur AsyncWebServer
 * @param devManager Référence vers le gestionnaire de matériel
 */
void setupWebServerRoutes(AsyncWebServer& server, DeviceManager& devManager);

