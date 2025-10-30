import { state } from './state.js';
import { DOMElements } from './dom.js';
import { UIController } from './ui.js';

export const BluetoothController = {
    async connect() {
        if (!navigator.bluetooth) {
            console.error('Web Bluetooth API not available in this browser.');
            UIController.updateTrainerConnectionUI(false);
            return;
        }

        try {
            console.log('Requesting Bluetooth device (Fitness Machine Service)...');

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [0x1826] }], // Fitness Machine Service (0x1826)
                optionalServices: [0x1826] // ensure we can access characteristics
            });

            state.trainer.device = device;
            device.addEventListener('gattserverdisconnected', this.onDisconnect.bind(this));

            const server = await device.gatt.connect();
            console.log('GATT connected:', server);

            const service = await server.getPrimaryService(0x1826);
            console.log('Fitness Machine service obtained:', service);

            // Indoor Bike Data (0x2AD2) and Fitness Machine Control Point (0x2AD9)
            state.trainer.dataCharacteristic = await service.getCharacteristic(0x2AD2);
            state.trainer.controlCharacteristic = await service.getCharacteristic(0x2AD9).catch(() => {
                console.warn('Control Point not available (expected on some trainers).');
                return null;
            });

            await state.trainer.dataCharacteristic.startNotifications();
            state.trainer.dataCharacteristic.addEventListener('characteristicvaluechanged', this.handleData.bind(this));

            state.trainer.connected = true;
            UIController.updateTrainerConnectionUI(true);

            console.log('Notifications started for Indoor Bike Data.');

        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            UIController.updateTrainerConnectionUI(false);
        }
    },
    onDisconnect() {
        state.trainer.connected = false;
        state.trainer.device = null;
        UIController.updateTrainerConnectionUI(false);
        console.log('Trainer disconnected.');
    },
    handleData(event) {
    try {
        const value = event.target.value; // DataView
        //console.log('Received data:', value);
        const flags = value.getUint16(0, true);
        let offset = 2;

        // --- Instantaneous Speed (always present, uint16, 0.01 kph) ---
        const speed = value.getUint16(offset, true) / 100;
        offset += 2;

        // --- Average Speed (Bit 1) ---
        if (flags & 0x0002) {
            offset += 2;
        }

        // --- Instantaneous Cadence (Bit 2) ---
        if (flags & 0x0004) {
            offset += 2;
        }

        // --- Average Cadence (Bit 3) ---
        if (flags & 0x0008) {
            offset += 2;
        }

        // --- Total Distance (Bit 4, uint24) ---
        if (flags & 0x0010) {
            offset += 3; // not 4!
        }

        // --- Resistance Level (Bit 5, int16) ---
        if (flags & 0x0020) {
            offset += 2;
        }

        // --- Instantaneous Power (Bit 6, int16) ---
        if (flags & 0x0040) {
            if (offset + 2 <= value.byteLength) {
                const power = value.getInt16(offset, true);
                state.power = power;
                // UIController.updatePower(); // update in game loop
                return;
            }
        }
        } catch (err) {
            console.error('Error parsing indoor bike data:', err);
        }
    },


    async reset() {
        if (!state.trainer.connected || !state.trainer.controlCharacteristic) return;

        const command = new Uint8Array([0x01]); // Reset

        try {
            await state.trainer.controlCharacteristic.writeValue(command);
            console.log('Trainer reset command sent.');
        } catch (err) {
            console.error("Error sending reset command:", err);
        }
    },

    async setGradient(gradient) {
        if (!state.trainer.connected || !state.trainer.controlCharacteristic || state.trainer.isSettingGradient) return;

        state.trainer.isSettingGradient = true;

        gradient = Math.max(-10, Math.min(20, gradient));
        const gradientValue = Math.round(gradient * 100);

        const command = new Uint8Array(5);
        const dataView = new DataView(command.buffer);
        dataView.setUint8(0, 0x11); // Set Simulation Parameters
        dataView.setInt16(1, 0, true); // Wind speed (0)
        dataView.setInt16(3, gradientValue, true); // Grade


        try {
            await state.trainer.controlCharacteristic.writeValue(command);
        } catch (err) {
            console.error("Error setting gradient:", err);
        } finally {
            state.trainer.isSettingGradient = false;
        }

    },

    async setErgMode(watts) {
        if (!state.trainer.connected || !state.trainer.controlCharacteristic || state.trainer.isSettingErg) return;

        state.trainer.isSettingErg = true;

        const command = new Uint8Array(3);
        const dataView = new DataView(command.buffer);
        dataView.setUint8(0, 0x05); // Set Target Power
        dataView.setUint16(1, watts, true); // Target Power in Watts

        try {
            await state.trainer.controlCharacteristic.writeValue(command);
            console.log(`ERG mode set to ${watts}W`);
        } catch (err) {
            console.error("Error setting ERG mode:", err);
        } finally {
            state.trainer.isSettingErg = false;
        }
    },

    async connectPowerMeter() {
        if (!navigator.bluetooth) {
            console.error('Web Bluetooth API not available in this browser.');
            UIController.updatePowerMeterConnectionUI(false);
            return;
        }

        try {
            console.log('Requesting Bluetooth device (Cycling Power Service)...');

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [0x1818] }], // Cycling Power Service (0x1818)
                optionalServices: [0x1818]
            });

            state.powerMeter.device = device;
            device.addEventListener('gattserverdisconnected', this.onPowerMeterDisconnect.bind(this));

            const server = await device.gatt.connect();
            console.log('GATT connected for Power Meter:', server);

            const service = await server.getPrimaryService(0x1818);
            console.log('Cycling Power service obtained:', service);

            state.powerMeter.powerCharacteristic = await service.getCharacteristic(0x2A63); // Cycling Power Measurement

            await state.powerMeter.powerCharacteristic.startNotifications();
            state.powerMeter.powerCharacteristic.addEventListener('characteristicvaluechanged', this.handlePowerData.bind(this));

            state.powerMeter.connected = true;
            UIController.updatePowerMeterConnectionUI(true);

            console.log('Notifications started for Cycling Power Measurement.');

        } catch (error) {
            console.error('Power Meter connection failed:', error);
            UIController.updatePowerMeterConnectionUI(false);
        }
    },

    onPowerMeterDisconnect() {
        state.powerMeter.connected = false;
        state.powerMeter.device = null;
        UIController.updatePowerMeterConnectionUI(false);
        console.log('Power Meter disconnected.');
    },

    handlePowerData(event) {
        try {
            const value = event.target.value; // DataView
            const flags = value.getUint8(0);
            let offset = 2; // Start after flags

            // Power is a sint16
            const power = value.getInt16(offset, true);
            state.power = power;

        } catch (err) {
            console.error('Error parsing power data:', err);
        }
    }
};
