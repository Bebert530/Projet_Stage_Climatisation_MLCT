#pragma once

#include <Arduino.h>

/**
 * @class SwitchOutput
 * @brief Contrôleur générique pour sorties Tout-ou-Rien (Relais compresseur, relais pompe, spots, vannes)
 */
class SwitchOutput {
public:
    SwitchOutput(uint8_t gpio = 255, bool activeLow = false)
        : _gpio(gpio), _activeLow(activeLow), _state(false) {}

    void begin(uint8_t gpio, bool activeLow = false) {
        _gpio = gpio;
        _activeLow = activeLow;
        _state = false;
        if (isValid()) {
            pinMode(_gpio, OUTPUT);
            writeRaw(false);
        }
    }

    void set(bool on) {
        _state = on;
        if (isValid()) {
            writeRaw(_state);
        }
    }

    void on() { set(true); }
    void off() { set(false); }

    void toggle() { set(!_state); }

    bool getState() const { return _state; }
    uint8_t getGpio() const { return _gpio; }
    bool isValid() const { return _gpio < 40; }

    void release() {
        if (isValid()) {
            writeRaw(false);
            pinMode(_gpio, INPUT);
        }
        _gpio = 255;
        _state = false;
    }

private:
    uint8_t _gpio;
    bool _activeLow;
    bool _state;

    void writeRaw(bool logicState) {
        uint8_t pinLevel = _activeLow ? (logicState ? LOW : HIGH) : (logicState ? HIGH : LOW);
        digitalWrite(_gpio, pinLevel);
    }
};

/**
 * @class PwmOutput
 * @brief Contrôleur générique pour sorties progressives PWM / MOSFET (Pulseur d'air, variateurs LED)
 */
class PwmOutput {
public:
    PwmOutput(uint8_t gpio = 255, int8_t channel = -1, uint32_t freq = 5000, uint8_t resolution = 8)
        : _gpio(gpio), _channel(channel), _freq(freq), _resolution(resolution), _duty(0), _state(false) {}

    void begin(uint8_t gpio, int8_t channel = -1, uint32_t freq = 5000, uint8_t resolution = 8) {
        _gpio = gpio;
        _channel = channel;
        _freq = freq;
        _resolution = resolution;
        _duty = 0;
        _state = false;

        if (isValid()) {
            pinMode(_gpio, OUTPUT);
            digitalWrite(_gpio, LOW);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
            ledcAttach(_gpio, _freq, _resolution);
            ledcWrite(_gpio, 0);
#else
            if (_channel >= 0) {
                ledcSetup(_channel, _freq, _resolution);
                ledcAttachPin(_gpio, _channel);
                ledcWrite(_channel, 0);
            }
#endif
        }
    }

    void write(uint8_t duty, bool enabled = true) {
        _duty = duty;
        _state = enabled && (_duty > 0);
        uint8_t effectiveVal = _state ? _duty : 0;

        if (isValid()) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
            ledcWrite(_gpio, effectiveVal);
#else
            if (_channel >= 0) {
                ledcWrite(_channel, effectiveVal);
            }
#endif
        }
    }

    void off() {
        write(0, false);
    }

    uint8_t getDuty() const { return _duty; }
    bool isEnabled() const { return _state; }
    uint8_t getGpio() const { return _gpio; }
    int8_t getChannel() const { return _channel; }
    bool isValid() const { return _gpio < 40; }

    void release() {
        if (isValid()) {
            off();
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
            ledcDetach(_gpio);
#else
            if (_channel >= 0) {
                ledcDetachPin(_gpio);
            }
#endif
            pinMode(_gpio, OUTPUT);
            digitalWrite(_gpio, LOW);
        }
        _gpio = 255;
        _channel = -1;
        _state = false;
        _duty = 0;
    }

private:
    uint8_t _gpio;
    int8_t _channel;
    uint32_t _freq;
    uint8_t _resolution;
    uint8_t _duty;
    bool _state;
};

