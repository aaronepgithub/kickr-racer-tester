import { state } from './state.js';
import { BluetoothController } from './bluetooth.js';
import { FirebaseController } from './firebase.js';
import { PhysicsController } from './physics.js';

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- CONSTANTS FOR GAME VIEW ---
const GAME_VIEW_DISTANCE = 0.15; // miles
// Rider is positioned closer to the center in game view for better visibility
const RIDER_POSITION_PERCENT = 50; // Rider is centered horizontally

export const UIController = {
    init() {
        state.riderWeightLbs = parseInt(document.getElementById('racer-weight-input').value, 10);

        // Set up background music
        state.music = new Audio('/assets/music/tropical_fantasy.mp3');
        state.music.loop = true;

        document.getElementById('connect-btn').addEventListener('click', () => BluetoothController.connect());
        document.getElementById('connect-power-meter-btn').addEventListener('click', () => BluetoothController.connectPowerMeter());
        document.getElementById('simulator-btn').addEventListener('click', () => this.toggleSimulator());
        document.getElementById('fullscreen-btn').addEventListener('click', () => this.enterGameView());
        document.getElementById('gpx-upload').addEventListener('change', (event) => this.handleFileUpload(event));
        document.getElementById('racer-name-input').addEventListener('input', () => this.updateStartRaceButtonState());
        document.getElementById('racer-weight-input').addEventListener('input', (e) => {
            state.riderWeightLbs = parseInt(e.target.value, 10);
            this.updateStartRaceButtonState();
        });
        document.getElementById('start-race-btn').addEventListener('click', () => this.startRace());

        document.getElementById('collision-avoidance-toggle').addEventListener('change', (e) => {
            state.simulator.collisionAvoidance.active = e.target.checked;
            this.updateCollisionAvoidanceUI();
        });

        document.getElementById('ghost-pacer-mode').addEventListener('change', (e) => {
            state.ghostPacer.mode = e.target.value;
            this.updateGhostPacerUI();
        });
        document.getElementById('ghost-target-speed').addEventListener('input', (e) => {
            state.ghostPacer.targetSpeed = parseFloat(e.target.value);
        });
        document.getElementById('ghost-target-power').addEventListener('input', (e) => {
            state.ghostPacer.targetPower = parseInt(e.target.value, 10);
        });

        document.getElementById('erg-mode-toggle').addEventListener('change', (e) => {
            state.ergMode.active = e.target.checked;
            this.updateErgModeUI();
        });
        document.getElementById('erg-watts-input').addEventListener('input', (e) => {
            state.ergMode.zone2Watts = parseInt(e.target.value, 10);
        });

        // Power slider has been replaced with cadence and gear sliders

        document.getElementById('simulator-cadence-slider').addEventListener('input', (e) => {
            if (state.simulator.active) {
                state.simulator.cadence = parseInt(e.target.value, 10);
                document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
                this.calculateSimulatorPower();
            }
        });

        document.getElementById('simulator-gear-slider').addEventListener('input', (e) => {
            if (state.simulator.active) {
                state.simulator.gear = parseInt(e.target.value, 10);
                document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
                this.calculateSimulatorPower();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (state.simulator.active) {
                if (e.key === ' ') { // Spacebar for jumping
                    this.handleJump();
                }
                else if (e.key === 'ArrowUp') {
                    state.simulator.cadence = Math.min(95, state.simulator.cadence + 1);
                    document.getElementById('simulator-cadence-slider').value = state.simulator.cadence;
                    document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
                }
                else if (e.key === 'ArrowDown') {
                    state.simulator.cadence = Math.max(85, state.simulator.cadence - 1);
                    document.getElementById('simulator-cadence-slider').value = state.simulator.cadence;
                    document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
                }
                else if (e.key === 'ArrowRight') {
                    state.simulator.gear = Math.min(12, state.simulator.gear + 1);
                    document.getElementById('simulator-gear-slider').value = state.simulator.gear;
                    document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
                }
                else if (e.key === 'ArrowLeft') {
                    state.simulator.gear = Math.max(1, state.simulator.gear - 1);
                    document.getElementById('simulator-gear-slider').value = state.simulator.gear;
                    document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
                }
                this.calculateSimulatorPower();
            }
        });

        this.loadCourses();
        this.updateStartRaceButtonState();
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && state.simulator.active) {
                const simControls = document.getElementById('simulator-controls');
                const slider = document.getElementById('simulator-power-slider-container');
                if (simControls) document.body.appendChild(simControls);
                if (slider) {
                    // Restore original, centered bottom slider classes used in markup
                    slider.className = 'hidden fixed bottom-10 left-1/2 transform -translate-x-1/2 w-3/4 z-50 bg-gray-800 p-4 rounded-lg';
                    slider.style.zIndex = '';
                    document.body.appendChild(slider);
                }
                // Ensure UI visibility is consistent after restoring elements
                this.updateTrainerConnectionUI(state.trainer.connected);
            }
        });
    },

    toggleSimulator() {
        state.simulator.active = !state.simulator.active;
        state.trainer.connected = state.simulator.active;

        const collisionContainer = document.getElementById('collision-avoidance-container');
        if (state.simulator.active) {
            state.ergMode.active = false;
            document.getElementById('erg-mode-toggle').checked = false;
            this.updateErgModeUI();
            collisionContainer.classList.remove('hidden');
            state.simulator.collisionAvoidance.active = document.getElementById('collision-avoidance-toggle').checked;
        } else {
            // When simulator is deactivated, also deactivate collision avoidance
            state.simulator.collisionAvoidance.active = false;
            document.getElementById('collision-avoidance-toggle').checked = false;
            collisionContainer.classList.add('hidden');
        }

        this.updateTrainerConnectionUI(state.trainer.connected);
        this.updateStartRaceButtonState();
        this.updateCollisionAvoidanceUI();
    },

    updateTrainerConnectionUI(connected) {
        const simulatorControls = document.getElementById('simulator-controls');
        const simulatorSlider = document.getElementById('simulator-power-slider-container');
        const bluetoothStatus = document.getElementById('bluetooth-status');
        const connectBtn = document.getElementById('connect-btn');
        const simulatorBtn = document.getElementById('simulator-btn');
        const ergModeSection = document.getElementById('erg-mode-section');

        if (connected) {
            if (state.simulator.active) {
                // Show only the simulator slider in the main UI (the compact HUD is used in game view)
                // BUT don't show the slider until the race has started to avoid UI clutter before start
                if (state.raceStarted || state.gameViewActive) {
                    // Position slider lower-right when visible (consistent both in-game and during race)
                    simulatorSlider.className = 'fixed bottom-4 right-4 w-64 bg-gray-800 p-3 rounded-lg';
                    simulatorSlider.style.zIndex = '10';
                    simulatorSlider.classList.remove('hidden');
                } else {
                    simulatorSlider.classList.add('hidden');
                }
                // Keep the larger simulator HUD hidden (redundant)
                if (simulatorControls) simulatorControls.classList.add('hidden');
                bluetoothStatus.textContent = "Simulator Active";
                bluetoothStatus.classList.add("text-purple-400");
                bluetoothStatus.classList.remove("text-red-400");
                connectBtn.classList.add('hidden');
                simulatorBtn.textContent = "Disable Simulator";
                ergModeSection.classList.add('hidden');
                this.updateSimulatorUI();
            } else {
                bluetoothStatus.textContent = 'Connected';
                bluetoothStatus.classList.add('text-green-400');
                bluetoothStatus.classList.remove('text-red-400');
                connectBtn.textContent = 'Connected';
                connectBtn.disabled = true;
                simulatorBtn.classList.add('hidden');
                ergModeSection.classList.remove('hidden');
            }
        } else {
            simulatorControls.classList.add('hidden');
            simulatorSlider.classList.add('hidden');
            bluetoothStatus.textContent = "Disconnected";
            bluetoothStatus.classList.add("text-red-400");
            bluetoothStatus.classList.remove("text-purple-400");
            connectBtn.classList.remove('hidden');
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
            simulatorBtn.textContent = "Finger Power";
            simulatorBtn.classList.remove('hidden');
            ergModeSection.classList.add('hidden');
        }
    },

    updatePowerMeterConnectionUI(connected) {
        const powerMeterStatus = document.getElementById('power-meter-status');
        const connectPowerMeterBtn = document.getElementById('connect-power-meter-btn');

        if (connected) {
            powerMeterStatus.textContent = 'Connected';
            powerMeterStatus.classList.add('text-green-400');
            powerMeterStatus.classList.remove('text-red-400');
            connectPowerMeterBtn.textContent = 'Connected';
            connectPowerMeterBtn.disabled = true;
        } else {
            powerMeterStatus.textContent = 'Disconnected';
            powerMeterStatus.classList.add('text-red-400');
            powerMeterStatus.classList.remove('text-green-400');
            connectPowerMeterBtn.disabled = false;
            connectPowerMeterBtn.textContent = 'Connect';
        }
    },

    updatePowerMeterConnectionUI(connected) {
        const powerMeterStatus = document.getElementById('power-meter-status');
        const connectPowerMeterBtn = document.getElementById('connect-power-meter-btn');
        const connectBtn = document.getElementById('connect-btn');
        const simulatorBtn = document.getElementById('simulator-btn');

        if (connected) {
            powerMeterStatus.textContent = 'Connected';
            powerMeterStatus.classList.add('text-green-400');
            powerMeterStatus.classList.remove('text-red-400');
            connectPowerMeterBtn.textContent = 'Connected';
            connectPowerMeterBtn.disabled = true;
            connectBtn.classList.add('hidden');
            simulatorBtn.classList.add('hidden');
        } else {
            powerMeterStatus.textContent = 'Disconnected';
            powerMeterStatus.classList.add('text-red-400');
            powerMeterStatus.classList.remove('text-green-400');
            connectPowerMeterBtn.disabled = false;
            connectPowerMeterBtn.textContent = 'Connect';
            connectBtn.classList.remove('hidden');
            simulatorBtn.classList.remove('hidden');
        }
    },

    calculateSimulatorPower() {
        // Gear 1 has highest resistance, Gear 12 has lowest
        // To achieve 30mph on flat road (0% gradient) at 100rpm in gear 1:
        // Base power calculation
        const maxPower = 600; // Power needed for 30mph in hardest gear at 100rpm
        const gearFactor = (13 - state.simulator.gear) / 12; // 1.0 (gear1) down to ~0.08 (gear12)
        const cadenceFactor = state.simulator.cadence / 100; // normalized to 100 RPM

        state.simulator.power = Math.round(maxPower * gearFactor * cadenceFactor);

        document.getElementById('sim-power-display').textContent = `${state.simulator.power} W`;
    },

    updateSimulatorUI() {
        document.getElementById('sim-power-display').textContent = `${state.simulator.power} W`;
        document.getElementById('simulator-cadence-slider').value = state.simulator.cadence;
        document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
        document.getElementById('simulator-gear-slider').value = state.simulator.gear;
        document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
    },

    updateErgModeUI() {
        const wattsInputContainer = document.getElementById('erg-watts-input-container');
        if (state.ergMode.active) {
            wattsInputContainer.classList.remove('hidden');
        } else {
            wattsInputContainer.classList.add('hidden');
        }
    },

    updateCollisionAvoidanceUI() {
        const statusEl = document.getElementById('collision-avoidance-status');
        if (state.simulator.collisionAvoidance.active) {
            statusEl.textContent = '(On)';
            statusEl.classList.add('text-green-400');
            statusEl.classList.remove('text-red-400');
        } else {
            statusEl.textContent = '(Off)';
            statusEl.classList.add('text-red-400');
            statusEl.classList.remove('text-green-400');
        }
    },

    async loadCourses() {
        const courseList = document.getElementById('course-list');
        courseList.innerHTML = '<p>Loading courses...</p>';
        const courses = await FirebaseController.getCourses();
        courseList.innerHTML = '';
        if (courses.length === 0) {
            courseList.innerHTML = '<p>No courses found.</p>';
            return;
        }
        courses.forEach(course => {
            const courseEl = document.createElement('div');
            courseEl.className = 'p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700';
            courseEl.textContent = course.name;
            courseEl.addEventListener('click', () => this.selectCourse(course));
            courseList.appendChild(courseEl);
        });
    },

    selectCourse(course) {
        state.course = course;
        state.gpxData = JSON.parse(course.gpx);
        state.totalDistance = course.totalDistance;

        if (state.course.recordRun && state.course.recordRun.checkpointTimes) {
            state.course.recordRun.checkpointTimes.forEach(cp => {
                if (cp.distance === undefined) {
                    cp.distance = cp.mile * state.totalDistance;
                }
            });
        }
        const courseList = document.getElementById('course-list');
        Array.from(courseList.children).forEach(c => c.classList.remove('bg-cyan-700'));
        const selectedEl = Array.from(courseList.children).find(c => c.textContent === course.name);
        if (selectedEl) selectedEl.classList.add('bg-cyan-700');

        this.drawCourseProfile();
        this.displayCourseRecords();
        this.updateStartRaceButtonState();
        document.getElementById('race-status').textContent = `${course.name} selected.`;
    },

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const gpxFileName = document.getElementById('gpx-file-name');
        gpxFileName.textContent = `Parsing ${file.name}...`;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = PhysicsController.parseGPX(e.target.result, file.name);
            if (!result) {
                gpxFileName.textContent = "Invalid GPX file";
                return;
            }
            gpxFileName.textContent = "Uploading...";
            const courseId = await FirebaseController.uploadCourse(result);
            if (courseId) {
                gpxFileName.textContent = "Uploaded!";
                await this.loadCourses();
                const courses = await FirebaseController.getCourses();
                const newCourse = courses.find(c => c.id === courseId);
                if (newCourse) this.selectCourse(newCourse);
            } else {
                gpxFileName.textContent = "Upload failed.";
            }
        };
        reader.readAsText(file);
    },

    startRace() {
        if (!state.simulator.active) {
            BluetoothController.reset();
        }
        document.getElementById('pre-race-setup').classList.add('hidden');
        if (!state.gameViewActive) {
            document.getElementById('race-display').classList.remove('hidden');
        }
        document.getElementById('countdown-section').classList.remove('hidden');
        document.getElementById('fullscreen-btn').classList.remove('hidden');
        this.startCountdown();
    },

    enterGameView() {
        state.gameViewActive = true;
        const gameView = document.getElementById('game-view');
        const mainContent = document.getElementById('main-content');

        // Create course profile for game view
        const courseProfile = document.createElement('div');
        courseProfile.id = 'game-course-profile';
        courseProfile.className = 'relative w-full h-full';
        const canvas = document.createElement('canvas');
        canvas.className = 'w-full h-full';
        courseProfile.appendChild(canvas);

    // Create a smaller HUD that stretches along the top of the screen (less intrusive font)
    const raceDisplayClone = document.getElementById('race-display').cloneNode(true);
    raceDisplayClone.id = 'game-race-display';
    // Stretch along top, but use smaller spacing and font so it doesn't dominate
    raceDisplayClone.className = 'absolute top-4 left-4 right-4 grid grid-cols-2 md:grid-cols-5 gap-2 bg-gray-900 bg-opacity-70 p-2 rounded-lg text-sm';
        
        // Clean up and append
        gameView.innerHTML = '';
        gameView.appendChild(courseProfile);
        gameView.appendChild(raceDisplayClone);

        if (state.simulator.active) {
            // Don't append the full simulator-controls (redundant with HUD).
            // Instead append the slider container repositioned to the lower-right so it doesn't block the course.
            const slider = document.getElementById('simulator-power-slider-container');
            if (slider) {
                // Reset any prior positioning classes then apply lower-right layout
                slider.className = 'fixed bottom-4 right-4 w-64 bg-gray-800 p-3 rounded-lg';
                // Ensure it's beneath rider/villain/ghost dots visually
                slider.style.zIndex = '10';
                gameView.appendChild(slider);
            }
        }
    // Hide the redundant simulator-controls HUD while in game view (we have a compact HUD already)
    const simControls = document.getElementById('simulator-controls');
    if (simControls) simControls.classList.add('hidden');

        mainContent.classList.add('hidden');
        gameView.classList.remove('hidden');
        
        if (state.simulator.collisionAvoidance.active) {
            const jumpControls = document.createElement('div');
            jumpControls.id = 'jump-controls';
            jumpControls.className = 'fixed bottom-4 left-4 z-50 flex flex-col gap-2';

            const jumpButton1 = document.createElement('button');
            jumpButton1.textContent = 'Jump 1';
            jumpButton1.className = 'bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded';

            const jumpButton2 = document.createElement('button');
            jumpButton2.textContent = 'Jump 2';
            jumpButton2.className = 'bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded';

            const jumpButton3 = document.createElement('button');
            jumpButton3.textContent = 'Jump 3';
            jumpButton3.className = 'bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded';

            jumpButton1.addEventListener('click', () => this.handleJump('jump1'));
            jumpButton2.addEventListener('click', () => this.handleJump('jump2'));
            jumpButton3.addEventListener('click', () => this.handleJump('jump3'));

            jumpControls.appendChild(jumpButton1);
            jumpControls.appendChild(jumpButton2);
            jumpControls.appendChild(jumpButton3);
            gameView.appendChild(jumpControls);
        }

        if (gameView.requestFullscreen) {
            gameView.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
        }
    },

    updateStartRaceButtonState() {
        const canStart = document.getElementById('racer-name-input').value.trim() !== '' &&
                         document.getElementById('racer-weight-input').value > 0 &&
                         state.course !== null &&
                         (state.trainer.connected || state.powerMeter.connected);
        document.getElementById('start-race-btn').disabled = !canStart;
    },

    displayCourseRecords() {
        const record = state.course ? state.course.recordRun : null;
        const recordHolderName = document.getElementById('record-holder-name');
        const recordHolderTime = document.getElementById('record-holder-time');
        if (record) {
            recordHolderName.textContent = record.runnerName;
            recordHolderTime.textContent = this.formatTime(record.totalTime);
        } else {
            recordHolderName.textContent = 'N/A';
            recordHolderTime.textContent = 'N/A';
        }

        const highScore = state.course ? state.course.highScore : null;
        const highScoreHolderName = document.getElementById('high-score-holder-name');
        const highScorePoints = document.getElementById('high-score-points');
        if (highScore) {
            highScoreHolderName.textContent = highScore.name;
            highScorePoints.textContent = Math.floor(highScore.points);
        } else {
            highScoreHolderName.textContent = 'N/A';
            highScorePoints.textContent = 'N/A';
        }
    },

    updateGhostDistance() {
        const distDiffMiles = state.ghostDistanceCovered - state.distanceCovered;
        const distDiffFeet = distDiffMiles * 5280;

        let distStr;
        if (Math.abs(distDiffFeet) < 1000) {
            distStr = `${distDiffFeet.toFixed(0)} ft`;
        } else {
            distStr = `${distDiffMiles.toFixed(2)} mi`;
        }

        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #ghost-diff-display') : document.getElementById('ghost-diff-display');
        if (displayEl) {
            displayEl.textContent = distStr;
            // If distDiffMiles is negative, the rider is ahead of the ghost.
            displayEl.className = distDiffMiles <= 0 ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
        }
    },

    updateGhostPacerUI() {
        const mode = state.ghostPacer.mode;
        const speedContainer = document.getElementById('ghost-target-speed-container');
        const powerContainer = document.getElementById('ghost-target-power-container');

        if (mode === 'target_speed') {
            speedContainer.classList.remove('hidden');
        } else {
            speedContainer.classList.add('hidden');
        }

        if (mode === 'target_power') {
            powerContainer.classList.remove('hidden');
        } else {
            powerContainer.classList.add('hidden');
        }
    },

    updateVillainDisplay() {
        const villainDisplay = state.gameViewActive ? document.querySelector('#game-race-display #villain-display') : document.getElementById('villain-display');
        if (!villainDisplay) return;

        if (state.villain.active) {
            villainDisplay.classList.remove('hidden');

            if (state.villain.drafting) {
                villainDisplay.classList.remove('border-red-500');
                villainDisplay.classList.add('border-green-500');
            } else {
                villainDisplay.classList.remove('border-green-500');
                villainDisplay.classList.add('border-red-500');
            }

            const nameEl = state.gameViewActive ? villainDisplay.querySelector('#villain-name-display') : document.getElementById('villain-name-display');
            const powerEl = state.gameViewActive ? villainDisplay.querySelector('#villain-power-display') : document.getElementById('villain-power-display');
            const timeEl = state.gameViewActive ? villainDisplay.querySelector('#villain-time-display') : document.getElementById('villain-time-display');
            const distEl = state.gameViewActive ? villainDisplay.querySelector('#villain-dist-display') : document.getElementById('villain-dist-display');

            if (nameEl) nameEl.textContent = state.villain.name;
            if (powerEl) powerEl.textContent = `${state.villain.power} Watts`;
            if (timeEl) timeEl.textContent = `${Math.ceil(state.villain.timeRemaining)} seconds`;
            if (distEl) {
                const dist = state.villain.distanceToPlayer;
                const sign = dist > 0 ? '+' : '';
                distEl.textContent = `  ${sign}${dist.toFixed(0)} ft`;
            }
        } else {
            villainDisplay.classList.add('hidden');
        }
    },


    showShiftWindow(gear) {
        this.updateRaceStatus(`Shift to Gear ${gear}!`);
    },

    showShiftSuccess() {
        this.updateRaceStatus('Perfect shift! +20');
    },

    showShiftMiss() {
        this.updateRaceStatus('Missed shift: -10% power for 5s');
    },

    updatePower() {
        this.updateRaceInfo('#power-display', `${state.power} W`);
    },
    updateSpeed() {
        this.updateRaceInfo('#speed-display', `${state.speed.toFixed(1)} mph`);
    },
    updateTargetSpeed() {
        if (state.simulator.active) {
            this.updateRaceInfo('#target-speed-display', `${state.simulator.targetSpeed.toFixed(1)} mph`);
        } else {
            this.updateRaceInfo('#target-speed-display', 'N/A');
        }
    },
    updateDistance() {
        this.updateRaceInfo('#distance-display', `${state.distanceCovered.toFixed(2)} mi`);
    },
    updateGradient() {
        this.updateRaceInfo('#gradient-display', `${state.gradient.toFixed(1)} %`);
    },
    updateElapsedTime() {
        this.updateRaceInfo('#elapsed-time-display', this.formatTime(state.elapsedTime));
    },

    updatePoints() {
        this.updateRaceInfo('#points-display', Math.floor(state.points));
    },

    updateCadence() {
        const value = state.simulator.active ? `${state.simulator.cadence} rpm` : `N/A`;
        this.updateRaceInfo('#cadence-display', value);
    },

    updateRaceStatus(message) {
        this.updateRaceInfo('#race-status', message);
    },

    updateRaceInfo(selector, text) {
        const el = state.gameViewActive ? document.querySelector(`#game-race-display ${selector}`) : document.querySelector(selector);
        if (el) el.textContent = text;
    },

    formatTime(totalSeconds) {
        const seconds = Math.floor(totalSeconds);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    startCountdown() {
        let count = 3;
        const countdownTimer = document.getElementById('countdown-timer');
        const countdownSection = document.getElementById('countdown-section');
        const update = () => {
            if (count > 0) {
                countdownTimer.textContent = `00:${String(count).padStart(2, '0')}`;
                count--;
            } else {
                clearInterval(state.countdownInterval);
                countdownTimer.textContent = "GO!";
                countdownSection.classList.replace('bg-gray-700', 'bg-green-600');
                setTimeout(() => {
                    countdownSection.classList.add('hidden');
                    state.raceStarted = true;
                    state.music.play();
                    state.villain.timeUntilNext = getRandomInt(15, 30);
                    document.getElementById('race-status').textContent = 'Race in Progress';
                    if (state.simulator.active) {
                        document.getElementById('simulator-power-slider-container').classList.remove('hidden');
                    }
                }, 500);
            }
        };
        update();
        state.countdownInterval = setInterval(update, 1000);
    },

    drawCourseProfile() {
        const canvas = state.gameViewActive ? document.querySelector('#game-course-profile canvas') : document.getElementById('course-profile-canvas');
        const placeholder = state.gameViewActive ? null : document.getElementById('course-profile-placeholder');

        if (!canvas) return; 

        if (!state.gpxData || state.gpxData.length === 0) {
            if(placeholder) placeholder.classList.remove('hidden');
            return;
        }
        if(placeholder) placeholder.classList.add('hidden');

        if (state.gameViewActive) {
            this.drawGameViewProfile(canvas);
        } else {
            this.drawStaticProfile(canvas);
        }
    },

    drawStaticProfile(canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const { width, height } = rect;
        const padding = 20;

        const elevations = state.gpxData.map(p => p.ele);
        const minEle = Math.min(...elevations);
        const eleRange = (Math.max(...elevations) - minEle || 1) * 2;

        ctx.fillStyle = '#374151'; // bg-gray-700
        ctx.fillRect(0, 0, width, height);

        const getCoords = (p) => {
            const x = (p.startDistance / state.totalDistance) * width;
            const y = height - (((p.ele - minEle) / eleRange) * (height - padding * 2) + padding);
            return { x, y };
        };

        ctx.beginPath();
        ctx.moveTo(0, getCoords(state.gpxData[0]).y);
        for (let i = 1; i < state.gpxData.length; i++) {
            ctx.lineTo(getCoords(state.gpxData[i]).x, getCoords(state.gpxData[i]).y);
        }

        ctx.strokeStyle = '#FBBF24'; // amber-400
        ctx.lineWidth = 3;
        ctx.stroke();
    },

    drawGameViewProfile(canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const { width, height } = rect;
        const padding = 20;

    // Allow simulator mode to zoom in by changing the visible window
    const viewDistance = state.simulator.active ? GAME_VIEW_DISTANCE * state.simulator.viewDistanceMultiplier : GAME_VIEW_DISTANCE;
    const distBehind = viewDistance * (RIDER_POSITION_PERCENT / 100);
    const distAhead = viewDistance * (1 - RIDER_POSITION_PERCENT / 100);

    const windowStart = state.distanceCovered - distBehind;
    const windowEnd = state.distanceCovered + distAhead;

        const visiblePoints = state.gpxData.filter(p => p.startDistance >= windowStart - 0.1 && p.startDistance <= windowEnd + 0.1);
        if (visiblePoints.length < 2) return;

    const elevations = visiblePoints.map(p => p.ele);
    state.gameView.minEle = Math.min(...elevations);
    // Amplify elevation range for simulator mode so hills look more dramatic
    const baseRange = (Math.max(...elevations) - state.gameView.minEle || 1) * 2;
    state.gameView.eleRange = state.simulator.active ? baseRange * state.simulator.elevationAmplifier : baseRange;

        ctx.clearRect(0, 0, width, height);

        const getGameCoords = (p) => {
            const x = ((p.startDistance - windowStart) / GAME_VIEW_DISTANCE) * width;
            const y = height - (((p.ele - state.gameView.minEle) / state.gameView.eleRange) * (height - padding * 2) + padding);
            return { x, y };
        };

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // blue-500
        gradient.addColorStop(1, 'rgba(17, 24, 39, 0.1)'); // gray-900
        ctx.fillStyle = gradient;
        ctx.beginPath();
        const firstPoint = getGameCoords(visiblePoints[0]);
        ctx.moveTo(firstPoint.x, height);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < visiblePoints.length; i++) {
            ctx.lineTo(getGameCoords(visiblePoints[i]).x, getGameCoords(visiblePoints[i]).y);
        }
        const lastPoint = getGameCoords(visiblePoints[visiblePoints.length - 1]);
        ctx.lineTo(lastPoint.x, height);
        ctx.closePath();
        ctx.fill();

        // Line stroke
        ctx.beginPath();
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < visiblePoints.length; i++) {
            ctx.lineTo(getGameCoords(visiblePoints[i]).x, getGameCoords(visiblePoints[i]).y);
        }
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.stroke();
    },

    updateRacerDots() {
        if (state.gameViewActive) {
            this._updateGameViewDot('rider', state.distanceCovered, '🚴');
            if (state.course && state.course.recordRun) {
                this._updateGameViewDot('ghost', state.ghostDistanceCovered, '👻');
            }
        } else {
            this._updateStaticDot('rider', state.distanceCovered, '🚴');
            if (state.course && state.course.recordRun) {
                this._updateStaticDot('ghost', state.ghostDistanceCovered, '👻');
            } else {
                 const ghostDot = document.getElementById('dot-ghost');
                 if (ghostDot) ghostDot.style.display = 'none';
            }
        }

        if (state.villain.active) {
            if (state.gameViewActive) {
                this._updateGameViewDot('villain', state.villain.distanceCovered, state.villain.emoji);
            } else {
                this._updateStaticDot('villain', state.villain.distanceCovered, state.villain.emoji);
            }
        } else {
            const villainDot = document.getElementById('dot-villain');
            if (villainDot) villainDot.style.display = 'none';
        }
    },

    _getDot(id, emoji, container) {
        let dot = document.getElementById(`dot-${id}`);
        if (!dot) {
            dot = document.createElement('div');
            dot.id = `dot-${id}`;
            if (id === 'rider') {
                dot.className = 'absolute text-6xl';
            } else {
                dot.className = 'absolute text-8xl';
            }

            let transform = 'translate(-50%, -90%)';
            if (id !== 'ghost') {
                transform += ' scaleX(-1)';
            }
            dot.style.transform = transform;

            if (id === 'rider') {
                dot.style.zIndex = '20';
            } else {
                dot.style.zIndex = '10';
            }
            container.appendChild(dot);
        } else if (dot.parentElement !== container) { // Ensure dot is in the correct container
            container.appendChild(dot);
        }
        dot.textContent = emoji; // Always update the emoji
        return dot;
    },

    _updateStaticDot(id, distance, emoji) {
        const container = document.getElementById('course-profile-container');
        if (!container || !state.gpxData || state.gpxData.length < 2) return;
        const dot = this._getDot(id, emoji, container);
        
        const elevations = state.gpxData.map(p => p.ele);
        const minEle = Math.min(...elevations);
        const eleRange = Math.max(...elevations) - minEle || 1;
        
        const point = PhysicsController.getPointAtDistance(distance);
        if (!point) return;

        const rect = container.querySelector('canvas').getBoundingClientRect();
        const padding = 20;
        const yPercent = 1 - ((point.ele - minEle) / eleRange);
        const topPx = yPercent * (rect.height - padding * 2) + padding;
        const leftPercent = (distance / state.totalDistance) * 100;

        dot.style.top = `${topPx}px`;
        dot.style.left = `${leftPercent}%`;
    },

    _updateGameViewDot(id, distance, emoji) {
        const container = document.getElementById('game-course-profile');
        if (!container || !state.gpxData || state.gpxData.length < 2) return;
        const dot = this._getDot(id, emoji, container);

            const viewDistance = state.simulator.active ? GAME_VIEW_DISTANCE * state.simulator.viewDistanceMultiplier : GAME_VIEW_DISTANCE;
        const distBehind = viewDistance * (RIDER_POSITION_PERCENT / 100);
        const windowStart = state.distanceCovered - distBehind;

        const leftPercent = ((distance - windowStart) / GAME_VIEW_DISTANCE) * 100;

        if (leftPercent < -10 || leftPercent > 110) { // Hide if far off-screen
            dot.style.display = 'none';
            return;
        }
        dot.style.display = 'block';

        const point = PhysicsController.getPointAtDistance(distance);
        if (!point) return;

        const rect = container.querySelector('canvas').getBoundingClientRect();
        const padding = 20;
        const yPercent = 1 - ((point.ele - state.gameView.minEle) / state.gameView.eleRange);
        
        let topPx = yPercent * (rect.height - padding * 2) + padding;

        // Apply jump height for the rider in collision avoidance mode
        if (id === 'rider' && state.simulator.collisionAvoidance.active) {
            topPx -= state.simulator.collisionAvoidance.jumpHeight;
        }

        topPx = Math.max(padding, Math.min(rect.height - padding, topPx));

        dot.style.top = `${topPx}px`;
        dot.style.left = `${leftPercent}%`;
    },

    handleJump(jumpType) {
        if (!state.simulator.collisionAvoidance.active) return;

        const { jumpState } = state.simulator.collisionAvoidance;

        // Button click logic: only works if on the ground
        if (jumpType) {
            if (jumpState === 'none') {
                state.simulator.collisionAvoidance.jumpState = jumpType;
            }
            return; // Don't fall through to keyboard logic
        }

        // Keyboard logic (original)
        if (jumpState === 'none') {
            state.simulator.collisionAvoidance.jumpState = 'jump1';
        } else if (jumpState === 'jump1') {
            state.simulator.collisionAvoidance.jumpState = 'jump2';
        } else if (jumpState === 'jump2') {
            state.simulator.collisionAvoidance.jumpState = 'jump3';
        }
    }
};