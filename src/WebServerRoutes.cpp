#include "WebServerRoutes.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

static void addCorsHeaders(AsyncWebServerResponse *response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void setupWebServerRoutes(AsyncWebServer& server, DeviceManager& devManager) {
    // -------------------------------------------------------------
    // GESTION GLOBALE CORS (Options pre-flight)
    // -------------------------------------------------------------
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");

    // -------------------------------------------------------------
    // 1. GET /api/devices : Retourne la liste complète des périphériques
    // -------------------------------------------------------------
    server.on("/api/devices", HTTP_GET, [&devManager](AsyncWebServerRequest *request) {
        String json = devManager.getDevicesJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 2. GET /api/available-pins : Retourne la liste des pins sûrs & libres
    // -------------------------------------------------------------
    server.on("/api/available-pins", HTTP_GET, [&devManager](AsyncWebServerRequest *request) {
        String json = devManager.getAvailablePinsJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 3. POST /api/devices/add : Ajout dynamique d'un équipement
    // -------------------------------------------------------------
    server.on("/api/devices/add", HTTP_POST, 
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(1024);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            String name = doc["name"] | "";
            String typeStr = doc["type"] | "RELAY";
            uint8_t gpio = doc["gpio"] | 255;
            bool isCore = doc["isCore"] | false;

            DeviceType type = DeviceManager::stringToType(typeStr);
            String errorMsg;

            bool ok = devManager.addDevice(name, type, gpio, isCore, errorMsg);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Périphérique ajouté avec succès\"}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                String resp = "{\"success\":false,\"error\":\"" + errorMsg + "\"}";
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", resp);
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 4. POST /api/devices/update : Modification d'un équipement
    // -------------------------------------------------------------
    server.on("/api/devices/update", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(1024);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            String name = doc["name"] | "";
            uint8_t gpio = doc["gpio"] | 255;
            String errorMsg;

            bool ok = devManager.updateDevice(id, name, gpio, errorMsg);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Périphérique mis à jour\"}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                String resp = "{\"success\":false,\"error\":\"" + errorMsg + "\"}";
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", resp);
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 5. POST /api/devices/delete : Suppression d'un équipement
    // -------------------------------------------------------------
    server.on("/api/devices/delete", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            String errorMsg;

            bool ok = devManager.deleteDevice(id, errorMsg);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Périphérique supprimé et broche libérée\"}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                int statusCode = errorMsg.indexOf("Core") >= 0 ? 403 : 400;
                String resp = "{\"success\":false,\"error\":\"" + errorMsg + "\"}";
                AsyncWebServerResponse *response = request->beginResponse(statusCode, "application/json", resp);
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 6. POST /api/devices/test : Test matériel temporaire (pulse)
    // -------------------------------------------------------------
    server.on("/api/devices/test", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            uint16_t duration = doc["duration"] | 1200;

            bool ok = devManager.testDevice(id, duration);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Signal de test envoyé\"}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                AsyncWebServerResponse *response = request->beginResponse(404, "application/json", "{\"success\":false,\"error\":\"Équipement introuvable\"}");
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 7. POST /api/devices/set-state : Commande en direct depuis l'UI
    // -------------------------------------------------------------
    server.on("/api/devices/set-state", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            uint8_t state = doc["state"] | 0;
            uint8_t value = doc["value"] | 0;

            bool ok = devManager.setDeviceState(id, state, value);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                AsyncWebServerResponse *response = request->beginResponse(404, "application/json", "{\"success\":false,\"error\":\"Périphérique introuvable\"}");
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 8. Télémétrie Climate Pro : GET /data
    // -------------------------------------------------------------
    server.on("/data", HTTP_GET, [](AsyncWebServerRequest *request) {
        String telemetry = "{"
            "\"t_amb\":23.4,"
            "\"t_water\":11.8,"
            "\"est_time\":45,"
            "\"est_water\":\"1h15\","
            "\"water_ready\":true,"
            "\"compressor_status\":\"Targeting -16.0°C\","
            "\"chiller_enabled\":1,"
            "\"energy\":12400"
        "}";
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", telemetry);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 9. Actions rapides existantes (rétro-compatibilité GET /action)
    // -------------------------------------------------------------
    server.on("/action", HTTP_GET, [](AsyncWebServerRequest *request) {
        // Paramètres éventuels : power, temp, fan, chiller, target_enabled
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\"}");
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 10. Fichiers statiques LittleFS (index.html, style.css, app.js)
    // -------------------------------------------------------------
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("max-age=300");

    // -------------------------------------------------------------
    // Gestionnaire 404 & OPTIONS (Pre-flight CORS)
    // -------------------------------------------------------------
    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->method() == HTTP_OPTIONS) {
            AsyncWebServerResponse *response = request->beginResponse(200);
            addCorsHeaders(response);
            request->send(response);
        } else {
            AsyncWebServerResponse *response = request->beginResponse(404, "text/plain", "404: Not Found");
            addCorsHeaders(response);
            request->send(response);
        }
    });

    Serial.println("[WebServer] Routes API REST et distribution LittleFS configurées.");
}

