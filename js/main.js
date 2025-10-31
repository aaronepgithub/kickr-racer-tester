import { state } from './state.js';
import { DOMElements } from './dom.js';
import { FirebaseController } from './firebase.js';
import { BluetoothController } from './bluetooth.js';
import { PhysicsController } from './physics.js';
import { UIController } from './ui.js';
import { villains } from './config.js';

// --- Helper Functions ---
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- MAIN GAME LOOP ---
let lastUpdateTime = Date.now();

function gameLoop() {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000; // seconds
    lastUpdateTime = now;

    // Always redraw the course profile in game view for a smooth scroll
    if (state.gameViewActive) {
        UIController.drawCourseProfile();
    }

    if ((state.trainer.connected || state.powerMeter.connected) && state.raceStarted && state.gpxData) {
        // Use simulator power if active
        if (state.simulator.active) {
            state.power = state.simulator.power;

            const targetSpeedMps = state.simulator.targetSpeed / 2.23694;
            const targetPower = PhysicsController.calculatePowerForTargetSpeed(targetSpeedMps, state.gradient, state.riderWeightLbs);
            const actualPower = state.power;
            const powerDifference = Math.abs(targetPower - actualPower);

            const maxPoints = 10;
            const maxPowerDifference = 100; // Points scale down to 0 over this difference
            let points = 0;
            if (powerDifference < maxPowerDifference) {
                points = maxPoints * (1 - (powerDifference / maxPowerDifference));
            }

            // Make points harder to earn in simulator mode by scaling
            const simScale = state.simulator.active ? state.simulator.pointsScale : 1;
            state.points += points * deltaTime * state.pointsMultiplier * simScale;
        }

        // --- Physics and State Updates ---
        const speedMps = PhysicsController.calculateSpeedMps(state.power, state.gradient, state.riderWeightLbs);
        state.speed = speedMps * 2.23694; // Convert m/s to mph
        state.elapsedTime += deltaTime;

        if (state.speed > 0) {
            const distanceThisFrame = (state.speed / 3600) * deltaTime; // distance in miles
            state.distanceCovered = Math.min(state.totalDistance, state.distanceCovered + distanceThisFrame);
        }

        // --- Ghost Position Calculation ---
        if (state.ghostPacer.mode !== 'off') {
            if (state.ghostPacer.mode === 'target_power') {
                const { targetPower } = state.ghostPacer;
                const currentPoint = PhysicsController.getPointAtDistance(state.ghostDistanceCovered);
                const gradient = currentPoint ? currentPoint.gradient : 0;
                const speedMps = PhysicsController.calculateSpeedMps(targetPower, gradient, state.riderWeightLbs);
                const ghostSpeedMph = speedMps * 2.23694;
                if (ghostSpeedMph > 0) {
                    const distanceThisFrame = (ghostSpeedMph / 3600) * deltaTime;
                    state.ghostDistanceCovered = Math.min(state.totalDistance, state.ghostDistanceCovered + distanceThisFrame);
                }
            } else {
                state.ghostDistanceCovered = PhysicsController.getGhostDistance(state.elapsedTime);
            }
        }

        // --- Jump Logic for Collision Avoidance ---
        if (state.simulator.collisionAvoidance.active) {
            const GRAVITY = 600; // pixels per second squared

            let { jumpHeight, jumpState } = state.simulator.collisionAvoidance;
            const JUMP_HEIGHTS = { jump1: 400, jump2: 500, jump3: 600 };

            if (jumpState.startsWith('jump')) {
                const targetHeight = JUMP_HEIGHTS[jumpState];
                jumpHeight += 400 * deltaTime; // Jump speed
                if (jumpHeight >= targetHeight) {
                    state.simulator.collisionAvoidance.jumpState = 'falling';
                }
            } else if (jumpState === 'falling') {
                jumpHeight -= GRAVITY * deltaTime;
                if (jumpHeight <= 0) {
                    jumpHeight = 0;
                    state.simulator.collisionAvoidance.jumpState = 'none';
                }
            }
            state.simulator.collisionAvoidance.jumpHeight = jumpHeight;
        }

        // --- Villain Logic ---
        const baseVillain = villains.rouleur; // For shared properties like cooldown

        // 1. Villain Spawning
        if (!state.villain.active) {
            state.villain.timeUntilNext -= deltaTime;
            if (state.villain.timeUntilNext <= 0) {
                const villainKeys = Object.keys(villains);
                const randomVillainKey = villainKeys[Math.floor(Math.random() * villainKeys.length)];
                const villain = villains[randomVillainKey];

                state.villain.active = true;
                state.villain.name = villain.name;
                const aggressiveness = state.simulator.active ? state.simulator.villainAggressiveness : 1;
                state.villain.power = state.power + villain.powerBoost * aggressiveness;
                state.villain.timeRemaining = villain.duration;
                state.villain.emoji = villain.emoji;
                state.villain.originalEmoji = villain.emoji;

                if (state.simulator.collisionAvoidance.active) {
                    // Spawn ahead of the player, moving towards them
                    state.villain.distanceCovered = state.distanceCovered + 0.1; // Spawn 0.1 miles ahead
                    state.villain.power *= 1.5; // Make them faster to ensure a challenge
                } else {
                    state.villain.distanceCovered = state.distanceCovered;
                }
                console.log(`A ${villain.name} appears!`);
            }
        }

        // 2. Villain Active Logic
        if (state.villain.active) {
            state.villain.timeRemaining -= deltaTime;

            // Calculate distance to player
            const distMiles = state.distanceCovered - state.villain.distanceCovered;
            state.villain.distanceToPlayer = distMiles * 5280; // convert to feet

            // Award drafting points (tighter window and scaled rewards in simulator mode)
            if (!state.simulator.collisionAvoidance.active) {
                const draftWindow = state.simulator.active ? -3 : -10; // feet behind
                const draftBasePoints = 10 * (state.simulator.active ? state.simulator.pointsScale : 1);
                if (state.villain.distanceToPlayer >= draftWindow && state.villain.distanceToPlayer < 0) {
                    state.points += draftBasePoints * deltaTime;
                    state.villain.drafting = true;
                    state.villain.emoji = '💨';
                } else {
                    state.villain.drafting = false;
                    state.villain.emoji = state.villain.originalEmoji;
                }
            }

            // Calculate villain's speed and distance
            const villainSpeedMps = PhysicsController.calculateSpeedMps(state.villain.power, state.gradient, state.riderWeightLbs);
            const villainSpeedMph = villainSpeedMps * 2.23694;
            if (villainSpeedMph > 0) {
                const villainDistanceThisFrame = (villainSpeedMph / 3600) * deltaTime;
                if (state.simulator.collisionAvoidance.active) {
                    state.villain.distanceCovered -= villainDistanceThisFrame; // Move left
                } else {
                    state.villain.distanceCovered += villainDistanceThisFrame; // Move right
                }
            }

            // 3. Villain Despawning
            if (state.villain.timeRemaining <= 0) {
                state.villain.active = false;
                // Simulator mode spawns villains more often
                state.villain.timeUntilNext = state.simulator.active ? getRandomInt(5, 15) : getRandomInt(15, 45);
                console.log(`The ${state.villain.name} fades away.`);
            }

            // --- Collision Detection (in screen space) ---
            if (state.simulator.collisionAvoidance.active && state.villain.active) {
                const distanceBetween = Math.abs(state.distanceCovered - state.villain.distanceCovered);
                // Adjust collision distance to be a bit more generous
                const collisionDistance = 0.008; // miles

                if (distanceBetween < collisionDistance) {
                    const playerPoint = PhysicsController.getPointAtDistance(state.distanceCovered);
                    const villainPoint = PhysicsController.getPointAtDistance(state.villain.distanceCovered);

                    if (playerPoint && villainPoint) {
                        const container = document.getElementById('game-course-profile');
                        const canvas = container ? container.querySelector('canvas') : null;

                        if (canvas) {
                            const rect = canvas.getBoundingClientRect();
                            const padding = 20;
                            const eleRange = state.gameView.eleRange;
                            const minEle = state.gameView.minEle;

                            // Calculate player's vertical position in pixels
                            const playerYPercent = 1 - ((playerPoint.ele - minEle) / eleRange);
                            let playerTopPx = playerYPercent * (rect.height - padding * 2) + padding;
                            playerTopPx -= state.simulator.collisionAvoidance.jumpHeight; // Apply jump

                            // Calculate villain's vertical position in pixels
                            const villainYPercent = 1 - ((villainPoint.ele - minEle) / eleRange);
                            const villainTopPx = villainYPercent * (rect.height - padding * 2) + padding;

                            // Check for collision (if player's bottom is below villain's top)
                            const PLAYER_HITBOX_HEIGHT = 40; // Approximate height of the player emoji in pixels
                            if (playerTopPx + PLAYER_HITBOX_HEIGHT > villainTopPx) {
                                endGame();
                            }
                        }
                    }
                }
            }
        }

        // --- UI Updates ---
        UIController.updatePower();
        UIController.updateSpeed();
        UIController.updateDistance();
        UIController.updateElapsedTime();
        UIController.updatePoints();
        UIController.updateRacerDots();
        UIController.updateGradient();
        UIController.updateVillainDisplay();
        UIController.updateCadence(); // new: show current cadence in HUD

        // --- Ghost Distance Calculation ---
        if (state.ghostPacer.mode !== 'off') {
            UIController.updateGhostDistance();
        }

        // --- Checkpoint Logic for saving the run ---
        const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
        if (nextCheckpoint && state.distanceCovered >= nextCheckpoint.distance) {
            state.checkpointTimes.push({
                percent: nextCheckpoint.percent,
                time: state.elapsedTime,
                distance: nextCheckpoint.distance
            });
            state.nextCheckpointIndex++;
        }

        // --- ERG Mode Logic ---
        if (state.ergMode.active) {
            let targetWatts = state.ergMode.zone2Watts;
            if (state.villain.active) {
                targetWatts += state.villain.powerBoost / 2;
            }

            // Smoothly adjust the target watts
            const smoothingFactor = 0.05; // Lower is smoother
            state.ergMode.targetWatts += (targetWatts - state.ergMode.targetWatts) * smoothingFactor;

            const ERG_UPDATE_INTERVAL = 1000; // ms
            if (now - state.ergMode.lastErgUpdateTime > ERG_UPDATE_INTERVAL) {
                const roundedTargetWatts = Math.round(state.ergMode.targetWatts);
                if (Math.abs(roundedTargetWatts - state.ergMode.lastSentErgWatts) > 1) {
                    if (!state.simulator.active) {
                        BluetoothController.setErgMode(roundedTargetWatts);
                    }
                    state.ergMode.lastSentErgWatts = roundedTargetWatts;
                    state.ergMode.lastErgUpdateTime = now;
                }
            }
        }

        // --- Gradient Updates ---
        if (!state.ergMode.active) { // Only run gradient simulation if ERG mode is off
            const currentPoint = PhysicsController.getPointAtDistance(state.distanceCovered);
            if (currentPoint) {
                // Use a smaller, smoothed gradient for trainer mode but amplify for simulator for drama
                const gradientFactor = state.simulator.active ? state.simulator.elevationAmplifier : 0.5;
                state.targetGradient = currentPoint.gradient * gradientFactor;
            }

            // Throttle bluetooth commands to every 10 seconds
            const GRADIENT_UPDATE_INTERVAL = 10000; // ms
            if (now - state.lastGradientUpdateTime > GRADIENT_UPDATE_INTERVAL) {
                state.gradient = state.targetGradient;
                // Only send if the change is significant enough to matter
                if (Math.abs(state.gradient - state.lastSentAverageGradient) > 0.1) {
                    if (!state.simulator.active && state.trainer.connected) {
                        const gradientToSend = Math.max(0, state.gradient);
                        BluetoothController.setGradient(gradientToSend);
                    }
                    state.lastSentAverageGradient = state.gradient;
                }
                
                state.lastGradientUpdateTime = now;
            }
        }

        // --- Finish Race Logic ---
        // Check if the rider has finished
        if (state.distanceCovered >= state.totalDistance && !state.riderFinished) {
            state.riderFinished = true;
            UIController.updateRaceStatus("You've Finished! Waiting for ghost...");
            console.log("Rider finished the race.");

            const runData = {
                runnerName: DOMElements.racerNameInput.value.trim(),
                totalTime: state.elapsedTime,
                checkpointTimes: state.checkpointTimes
            };
            FirebaseController.saveRun(state.course.id, runData);

            if (!state.course.highScore || state.points > state.course.highScore.points) {
                const highScoreData = {
                    name: DOMElements.racerNameInput.value.trim(),
                    points: state.points
                };
                FirebaseController.saveHighScore(state.course.id, highScoreData);
            }
        }

        // Check if the ghost has finished
        if (state.ghostPacer.mode !== 'off' && state.ghostDistanceCovered >= state.totalDistance && !state.ghostFinished) {
            state.ghostFinished = true;
            console.log("Ghost finished the race.");
        }

        // Check if both have finished to end the race
        if (state.riderFinished && (state.ghostFinished || state.ghostPacer.mode === 'off') && !state.raceFinished) {
            state.raceFinished = true; // Prevent this block from running multiple times
            state.raceStarted = false;
            state.music.pause();
            UIController.updateRaceStatus("Race Complete!");
            console.log("Race complete! Notification should be visible.");
        }

    }

    requestAnimationFrame(gameLoop);
} // end of gameLoop


// --- INITIALIZATION ---
function init() {
    UIController.init();
    FirebaseController.init().then(() => {
        UIController.loadCourses();
    });
    gameLoop(); // Start the loop
}

function endGame() {
    state.raceStarted = false;
    state.music.pause();
    UIController.updateRaceStatus("Game Over! You crashed.");
    // Optionally, you could show a game over screen or reset the game state
}

init();
