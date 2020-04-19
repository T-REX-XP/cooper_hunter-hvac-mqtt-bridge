#!/usr/bin/env node

'use strict';

const mqtt = require('mqtt');
const commands = require('./app/commandEnums');
const argv = require('minimist')(process.argv.slice(2), {
    string: ['hvac-host', 'mqtt-broker-url', 'mqtt-topic-prefix', 'mqtt-username', 'mqtt-password', 'interval'],
    '--': true,
});

/**
 * Helper: get property key for value
 * @param {*} value
 */
function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

/**
 * Connect to device
 */
const mqttTopicPrefix = argv['mqtt-topic-prefix'];

const deviceState = {
    temperature: null,
    fanSpeed: null,
    swingHor: null,
    swingVert: null,
    power: null,
    health: null,
    powerSave: null,
    lights: null,
    quiet: null,
    blow: null,
    air: null,
    sleep: null,
    turbo: null,
    mode: null
};

/**
 * Check if incoming device setting differs from last state and publish change if yes
 * @param {string} stateProp State property to be updated/compared with
 * @param {string} newValue New incoming device state value
 * @param {string} mqttTopic Topic (without prefix) to send with new value
 */
const publishIfChanged = function(stateProp, newValue, mqttTopic) {
    if (newValue !== deviceState[stateProp]) {
        deviceState[stateProp] = newValue;
        client.publish(mqttTopicPrefix + mqttTopic, newValue);
    }
};


const deviceOptions = {
    host: argv['hvac-host'],
    onStatus: (deviceModel) => {
        publishIfChanged('temperature', deviceModel.props["wdNumber"].toString(), '/temperature/get');
        //client.publish(mqttTopicPrefix + '/temperature/get', deviceModel.props["wdNumber"].toString());
        publishIfChanged('temperature_in', deviceModel.props[commands.temperature.code].toString(), '/temperature_in/get');
        //client.publish(mqttTopicPrefix + '/temperature_in/get', deviceModel.props[commands.temperature.code].toString());
        publishIfChanged('fanSpeed', getKeyByValue(commands.fanSpeed.value, deviceModel.props[commands.fanSpeed.code]).toString(), '/fanspeed/get');
        //client.publish(mqttTopicPrefix + '/fanspeed/get', commands.fanSpeed.value.getKeyByValue(deviceModel.props[commands.fanSpeed.code]).toString());
        publishIfChanged('power', getKeyByValue(commands.power.value, deviceModel.props[commands.power.code]).toString(), '/power/get');
        //client.publish(mqttTopicPrefix + '/power/get', commands.power.value.getKeyByValue(deviceModel.props[commands.power.code]).toString());
        publishIfChanged('health', getKeyByValue(commands.health.value, deviceModel.props[commands.health.code]).toString(), '/health/get');
        //client.publish(mqttTopicPrefix + '/health/get', commands.health.value.getKeyByValue(deviceModel.props[commands.health.code]).toString());
        //publishIfChanged('powerSave', getKeyByValue(commands.powerSave.value, deviceModel.props[commands.powerSave.code]).toString(), '/powersave/get')
        //client.publish(mqttTopicPrefix + '/powersave/get', commands.energySave.value.getKeyByValue(deviceModel.props[commands.energySave.code]).toString());
        publishIfChanged('lights', getKeyByValue(commands.lights.value, deviceModel.props[commands.lights.code]).toString(), '/lights/get');
        //client.publish(mqttTopicPrefix + '/lights/get', commands.lights.value.getKeyByValue(deviceModel.props[commands.lights.code]).toString());
        publishIfChanged('sleep', getKeyByValue(commands.sleep.value, deviceModel.props[commands.sleep.code]).toString(), '/sleep/get');
        //client.publish(mqttTopicPrefix + '/sleep/get', commands.sleep.value.getKeyByValue(deviceModel.props[commands.sleep.code]).toString());

        /**
         * Handle "off" mode status
         * Hass.io MQTT climate control doesn't support power commands through GUI,
         * so an additional pseudo mode is added
         */
        const extendedMode = (deviceModel.props[commands.power.code] === commands.power.value.on) ?
            getKeyByValue(commands.mode.value, deviceModel.props[commands.mode.code]).toString() :
            'off';
        publishIfChanged('mode', extendedMode, '/mode/get');
    },
    onUpdate: (deviceModel) => {
        console.log('[UDP] Status updated on %s', deviceModel.name);
    },
    onConnected: (deviceModel) => {
        client.subscribe(mqttTopicPrefix + '/temperature/set');
        client.subscribe(mqttTopicPrefix + '/mode/set');
        client.subscribe(mqttTopicPrefix + '/fanspeed/set');
        client.subscribe(mqttTopicPrefix + '/swinghor/set');
        client.subscribe(mqttTopicPrefix + '/swingvert/set');
        client.subscribe(mqttTopicPrefix + '/power/set');
        client.subscribe(mqttTopicPrefix + '/health/set');
        client.subscribe(mqttTopicPrefix + '/powersave/set');
        client.subscribe(mqttTopicPrefix + '/lights/set');
        client.subscribe(mqttTopicPrefix + '/quiet/set');
        client.subscribe(mqttTopicPrefix + '/blow/set');
        client.subscribe(mqttTopicPrefix + '/air/set');
        client.subscribe(mqttTopicPrefix + '/sleep/set');
        client.subscribe(mqttTopicPrefix + '/turbo/set');
    }
};

let hvac;

/**
 * Connect to MQTT broker
 */

const mqttOptions = {};
let authLog = '';
if (argv['mqtt-username'] && argv['mqtt-password']) {
    mqttOptions.username = argv['mqtt-username'];
    mqttOptions.password = argv['mqtt-password'];
    authLog = ' as "' + mqttOptions.username + '"';
}
let interval = 60;
if (argv['interval']) {
    interval = argv['interval'];
}
console.log("brocker: " + argv['mqtt-broker-url']);
const client = mqtt.connect(argv['mqtt-broker-url'], mqttOptions);
client.on('connect', () => {
    console.log('[MQTT] Connected to broker on ' + argv['mqtt-broker-url'] + authLog);
    hvac = require('./app/deviceFactory').connect(deviceOptions);
    //TODO: auto discoverty
    sendDiscoveryMessage();
    setInterval(x => {
        console.log("--Gget status from AC ");
        hvac.requestDeviceStatus();
    }, interval * 1000);
});

function sendDiscoveryMessage() {
    let uniqId = "CHac" + deviceOptions.host.replace(/\D/g, '');
    let discoveryObj = {
        "name": "AC Livingroom",
        //"device_class": "climate",
        //"state_topic": mqttTopicPrefix + "/mode/get",
        "mode_cmd_t": mqttTopicPrefix + "/mode/set",
        "mode_stat_t": mqttTopicPrefix + "/mode/get",
        "curr_temp_t": mqttTopicPrefix + "/temperature_in/get",
        "temp_cmd_t": mqttTopicPrefix + "/temperature/set",
        "temp_stat_t": mqttTopicPrefix + "/temperature/get",
        "uniq_id": uniqId,

        /* "fan_mode_state_topic": mqttTopicPrefix + "/fanspeed/get",
         "fan_mode_command_topic": mqttTopicPrefix + "/fanspeed/set",
         "swing_mode_state_topic": mqttTopicPrefix + "/swingvert/get",
         "swing_mode_command_topic": mqttTopicPrefix + "/swingvert/set",
         "power_state_topic": mqttTopicPrefix + "/power/get",
         "power_command_topic": mqttTopicPrefix + "/power/set",*/
        //"cmd_t": "home/OpenMQTTGateway_ESP32_BLE/commands/MQTTtoSYS/config",
        "device": {
            "name": "Nordic Evo 2",
            "manufacturer": "Cooper&Hunter",
            "sw_version": "v0.1",
            "identifiers": [
                "Ch-s09ftn-e2wf"
            ]
        },
        /* "mode_state_topic": mqttTopicPrefix + "/mode/get",
         "mode_command_topic": mqttTopicPrefix + "/mode/set",
         "fan_mode_state_topic": mqttTopicPrefix + "/fanspeed/get",
         "fan_mode_command_topic": mqttTopicPrefix + "/fanspeed/set",
         "swing_mode_state_topic": mqttTopicPrefix + "/swingvert/get",
         "swing_mode_command_topic": mqttTopicPrefix + "/swingvert/set",
         "power_state_topic": mqttTopicPrefix + "/power/get",
         "power_command_topic": mqttTopicPrefix + "/power/set",
         */
        "modes": ["off", "heat", "none", "auto", "cool", "dry", "wind"]
    };
    var mqttTopic = "/config";
    client.publish(mqttTopicPrefix + mqttTopic, JSON.stringify(discoveryObj));
}

client.on('message', (topic, message) => {
    message = message.toString();
    console.log('[MQTT] Message "%s" received for %s', message, topic);

    switch (topic) {
        case mqttTopicPrefix + '/temperature/set':
            hvac.setTemp(parseInt(message));
            return;
        case mqttTopicPrefix + '/mode/set':
            if (message === 'off' || message === 'none') {
                // Power off when "off" mode
                hvac.setPower(commands.power.value.off);
            } else {
                // Power on and set mode if other than 'off'
                if (hvac.device.props[commands.power.code] === commands.power.value.off) {
                    hvac.setPower(commands.power.value.on);
                }
                hvac.setMode(commands.mode.value[message]);
            }
            return;
        case mqttTopicPrefix + '/fanspeed/set':
            hvac.setFanSpeed(commands.fanSpeed.value[message]);
            return;
        case mqttTopicPrefix + '/swinghor/set':
            hvac.setSwingHor(commands.swingHor.value[message]);
            return;
        case mqttTopicPrefix + '/swingvert/set':
            hvac.setSwingVert(commands.swingVert.value[message]);
            return;
        case mqttTopicPrefix + '/power/set':
            hvac.setPower(parseInt(commands.power.value[message]));
            console.log("mqttTopicPrefix set power:" + message);
            return;
        case mqttTopicPrefix + '/health/set':
            hvac.setHealthMode(parseInt(message));
            return;
        case mqttTopicPrefix + '/powersave/set':
            hvac.setPowerSave(parseInt(message));
            return;
        case mqttTopicPrefix + '/lights/set':
            hvac.setLights(parseInt(message));
            return;
        case mqttTopicPrefix + '/quiet/set':
            hvac.setQuietMode(parseInt(message));
            return;
        case mqttTopicPrefix + '/blow/set':
            hvac.setBlow(parseInt(message));
            return;
        case mqttTopicPrefix + '/air/set':
            hvac.setAir(parseInt(message));
            return;
        case mqttTopicPrefix + '/sleep/set':
            hvac.setSleepMode(parseInt(message));
            return;
        case mqttTopicPrefix + '/turbo/set':
            hvac.setTurbo(parseInt(message));
            return;
    }
    console.log('[MQTT] No handler for topic %s', topic);
});