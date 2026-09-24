#pragma once

#include <Arduino.h>

/**
 * @class NonBlockingTimer
 * @brief Gestionnaire autonome de temporisation non-bloquante basée sur millis()
 */
class NonBlockingTimer {
public:
    NonBlockingTimer(unsigned long durationMs = 0) 
        : _durationMs(durationMs), _startTime(0), _running(false) {}

    /**
     * @brief Démarre ou redémarre la temporisation avec la durée configurée
     */
    void start() {
        _startTime = millis();
        _running = true;
    }

    /**
     * @brief Démarre la temporisation avec une nouvelle durée en millisecondes
     */
    void start(unsigned long durationMs) {
        _durationMs = durationMs;
        _startTime = millis();
        _running = true;
    }

    /**
     * @brief Arrête la temporisation
     */
    void stop() {
        _running = false;
    }

    /**
     * @brief Réinitialise l'origine des temps sans changer l'état actif
     */
    void reset() {
        _startTime = millis();
    }

    /**
     * @brief Vérifie si la temporisation est active
     */
    bool isRunning() const {
        return _running;
    }

    /**
     * @brief Vérifie si la durée est écoulée
     */
    bool hasExpired() const {
        if (!_running) return false;
        return (millis() - _startTime) >= _durationMs;
    }

    /**
     * @brief Pour les boucles périodiques : vérifie l'expiration et réinitialise automatiquement le repère
     * @return true si le cycle est écoulé
     */
    bool checkAndReset() {
        if (!_running) return false;
        unsigned long now = millis();
        if ((now - _startTime) >= _durationMs) {
            _startTime = now;
            return true;
        }
        return false;
    }

    /**
     * @brief Temps restant en millisecondes (0 si expirée ou arrêtée)
     */
    unsigned long getRemainingMs() const {
        if (!_running) return 0;
        unsigned long elapsed = millis() - _startTime;
        if (elapsed >= _durationMs) return 0;
        return (_durationMs - elapsed);
    }

    /**
     * @brief Temps restant en secondes (arrondi supérieur)
     */
    uint16_t getRemainingSec() const {
        unsigned long ms = getRemainingMs();
        return (uint16_t)((ms + 999) / 1000);
    }

    /**
     * @brief Temps écoulé depuis le démarrage en millisecondes
     */
    unsigned long getElapsedMs() const {
        if (!_running) return 0;
        return (millis() - _startTime);
    }

    /**
     * @brief Modifie la durée sans réinitialiser
     */
    void setDuration(unsigned long durationMs) {
        _durationMs = durationMs;
    }

    unsigned long getDurationMs() const {
        return _durationMs;
    }

private:
    unsigned long _durationMs;
    unsigned long _startTime;
    bool _running;
};

