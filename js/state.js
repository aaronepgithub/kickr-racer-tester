export const state = {
    userId: `rider-${Date.now()}`,

    racerName: '',

    // Course data
    course: null, // The full selected course object from Firebase
    gpxData: null, // The parsed route data for the current course
    totalDistance: 0,

    // Live race data
    distanceCovered: 0,
    speed: 0,
    power: 0,
    gradient: 0, // The current, smoothed gradient
    targetGradient: 0, // The actual gradient from the course data
    lastSentAverageGradient: 0, // The last average gradient value sent to the trainer
    lastGradientUpdateTime: 0,
    gradientSamples: [], // Samples for averaging gradient
    elapsedTime: 0,
    riderWeightLbs: 175,
    points: 0,
    pointsMultiplier: 1,
    lastPointsUpdateTime: 0,

    // Race state
    raceStarted: false,
    raceFinished: false, // True when both rider and ghost are done
    music: null,
    riderFinished: false,
    ghostFinished: false,
    gameViewActive: false,
    countdownInterval: null,

    // Game view specific state
    gameView: {
        minEle: 0,
        eleRange: 1
    },

    // Ghost data for comparison
    ghostDistanceCovered: 0,

    // Ghost pacer
    ghostPacer: {
        mode: 'record', // 'off', 'record', 'target_speed', 'target_power'
        targetSpeed: 20, // mph
        targetPower: 200, // watts
    },

    // Checkpoint tracking for the current run
    checkpointTimes: [],
    nextCheckpointIndex: 0,

    // Trainer connection
    trainer: {
        device: null,
        controlCharacteristic: null,
        dataCharacteristic: null,
        connected: false,
        isSettingGradient: false,
        isSettingErg: false,
    },

    // Power meter connection
    powerMeter: {
        device: null,
        powerCharacteristic: null,
        connected: false,
    },

    // Simulator mode
    simulator: {
        active: false,
        power: 100, // calculated power based on cadence and gear
        cadence: 90, // RPM - starting cadence
        gear: 6,    // 1-12, 1 is highest resistance
        targetSpeed: 20, // mph
        // Simulator tuning parameters (only affect simulator mode)
        // Lower viewDistanceMultiplier -> more zoomed-in (moves faster visually)
        viewDistanceMultiplier: 0.6,
        // Amplify elevation/gradient for a more dramatic visual/physics effect
        elevationAmplifier: 1.8,
        // Scale points earned while in simulator (lower means harder to earn points)
        pointsScale: 0.6,
        // Make villains more aggressive in simulator mode (>1 increases power)
        villainAggressiveness: 1.25,
        // New Collision Avoidance Game Mode
        collisionAvoidance: {
            active: false,
            jumpState: 'none', // 'none', 'jump1', 'jump2', 'jump3'
            jumpHeight: 0, // Current jump height in pixels
        },
    },

    // ERG mode
    ergMode: {
        active: false,
        zone2Watts: 150,
        targetWatts: 0,
        lastSentErgWatts: 0,
        lastErgUpdateTime: 0,
    },

    // Villain state
    villain: {
        active: false,
        name: null,
        power: 0,
        powerBoost: 0,
        emoji: null,
        originalEmoji: null,
        distanceToPlayer: 0, // in meters
        distanceCovered: 0,
        timeRemaining: 0,
        timeUntilNext: 30, // Initial delay before first villain can appear
        drafting: false
    }
};