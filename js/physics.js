import { state } from './state.js';

export const PhysicsController = {

    getPointAtDistance(distance) {
        if (!state.gpxData || state.gpxData.length < 2) return null;

        const currentPos = Math.min(state.totalDistance, Math.max(0, distance));

        let segmentIndex = state.gpxData.findIndex(p => currentPos >= p.startDistance && currentPos < (p.startDistance + p.distance));

        if (segmentIndex === -1) {
            segmentIndex = state.gpxData.length - 2; // On the last point or beyond
        }
        if (segmentIndex < 0) return null;

        const p1 = state.gpxData[segmentIndex];
        const p2 = state.gpxData[segmentIndex + 1];
        if (!p1 || !p2) return null;

        const segmentDist = p2.startDistance - p1.startDistance;
        const distIntoSegment = currentPos - p1.startDistance;
        const percentIntoSegment = segmentDist > 0 ? distIntoSegment / segmentDist : 0;
        
        const interpolatedEle = p1.ele + (p2.ele - p1.ele) * percentIntoSegment;
        const interpolatedGradient = p1.gradient + (p2.gradient - p1.gradient) * percentIntoSegment;

        return {
            ele: interpolatedEle,
            gradient: interpolatedGradient
        };
    },

    getGhostDistance(elapsedTime) {
        const { mode, targetSpeed, targetPower } = state.ghostPacer;

        if (mode === 'off') {
            return -1; // Indicates the ghost is off
        }

        if (mode === 'record') {
            if (!state.course.recordRun || !state.course.recordRun.checkpointTimes || state.course.recordRun.checkpointTimes.length === 0) {
                return 0;
            }

            const recordTimes = [{ percent: 0, time: 0, distance: 0 }, ...state.course.recordRun.checkpointTimes];
            let ghostSegmentIndex = recordTimes.findIndex(ct => ct.time > elapsedTime) - 1;

            if (ghostSegmentIndex === -2) { // Ghost has finished
                return state.totalDistance;
            }
            if (ghostSegmentIndex < 0) {
                ghostSegmentIndex = 0;
            }

            const startCp = recordTimes[ghostSegmentIndex];
            const endCp = recordTimes[ghostSegmentIndex + 1];
            if (!endCp) return startCp.distance;

            const timeInSegment = elapsedTime - startCp.time;
            const segmentDuration = endCp.time - startCp.time;
            const segmentDistance = endCp.distance - startCp.distance;

            if (segmentDuration > 0) {
                const progressInSegment = timeInSegment / segmentDuration;
                return startCp.distance + (progressInSegment * segmentDistance);
            } else {
                return startCp.distance;
            }
        }

        if (mode === 'target_speed') {
            const speedMph = targetSpeed;
            const distanceMiles = (speedMph / 3600) * elapsedTime;
            return distanceMiles;
        }

        // Note: target_power is handled incrementally in the main game loop.
        return 0;
    },

     parseGPX(gpxString, fileName) {

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(gpxString, "text/xml");
        const points = [];
        const trkpts = xmlDoc.getElementsByTagName("trkpt");

        if (trkpts.length === 0) return null;


        let courseName = fileName.replace('.gpx', '');
        const nameEl = xmlDoc.getElementsByTagName("name")[0];
        if (nameEl) {
            courseName = nameEl.textContent;
        }

        const maxPoints = 5000;
        const step = Math.max(1, Math.floor(trkpts.length / maxPoints));

        for (let i = 0; i < trkpts.length; i += step) {

            const ele = trkpts[i].getElementsByTagName("ele")[0];
            if (ele) {
                 points.push({
                    lat: parseFloat(trkpts[i].getAttribute("lat")),
                    lon: parseFloat(trkpts[i].getAttribute("lon")),
                    ele: parseFloat(ele.textContent)
                });
            }
        }

        const routeData = [];
        let totalDistanceKm = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const distanceKm = this.haversineDistance(p1, p2);
            const elevationChangeM = p2.ele - p1.ele;
            let gradient = (distanceKm > 0) ? (elevationChangeM / (distanceKm * 1000)) * 100 : 0;

            const startDistanceMiles = totalDistanceKm * 0.621371;

            routeData.push({
                startDistance: startDistanceMiles,
                distance: distanceKm * 0.621371,
                gradient: isNaN(gradient) ? 0 : gradient,
                ele: p1.ele,
            });
            totalDistanceKm += distanceKm;
        }


        if (points.length > 0) {
            routeData.push({
                startDistance: totalDistanceKm * 0.621371,
                distance: 0,
                gradient: 0,
                ele: points[points.length-1].ele
            });
        }

        const totalDistanceMiles = totalDistanceKm * 0.621371;
        const checkpoints = [];
        const checkpointInterval = 0.1; // miles
        if (totalDistanceMiles > 0) {
            for (let d = checkpointInterval; d < totalDistanceMiles; d += checkpointInterval) {
                 checkpoints.push({
                    percent: d / totalDistanceMiles,
                    distance: d,
                });
            }
        }

        return {
            name: courseName,
            route: routeData,
            totalDistance: totalDistanceMiles,
            checkpoints: checkpoints,
        };

    },
    haversineDistance(p1, p2) {
        const R = 6371; // km
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    calculateSpeedMps(power, gradient, weightLbs) {
        const riderWeightKg = weightLbs * 0.453592;
        const totalMass = riderWeightKg + 9; // Add bike weight
        const g = 9.81;
        const Crr = 0.005; // Rolling resistance
        const rho = 1.225; // Air density
        const CdA = 0.32; // Drag coefficient * frontal area

        const grade = gradient / 100;

        const forceGravity = totalMass * g * Math.sin(Math.atan(grade));
        const forceRolling = totalMass * g * Math.cos(Math.atan(grade)) * Crr;

        const powerRequired = (v) => {
            const f_drag = 0.5 * rho * CdA * v * v;
            return (forceRolling + forceGravity + f_drag) * v;
        };

        let low = 0;
        let high = 50; // 50 m/s is a safe upper bound.

        if (powerRequired(high) < power) return high;

        for (let i = 0; i < 30; i++) { // 30 iterations for precision
            const mid = (low + high) / 2;
            if (powerRequired(mid) < power) {
                low = mid;
            } else {
                high = mid;
            }
        }

        return high;
    },

    calculatePowerForTargetSpeed(targetSpeedMps, gradient, weightLbs) {
        const riderWeightKg = weightLbs * 0.453592;
        const totalMass = riderWeightKg + 9; // Add bike weight
        const g = 9.81;
        const Crr = 0.005; // Rolling resistance
        const rho = 1.225; // Air density
        const CdA = 0.32; // Drag coefficient * frontal area

        const grade = gradient / 100;

        const forceGravity = totalMass * g * Math.sin(Math.atan(grade));
        const forceRolling = totalMass * g * Math.cos(Math.atan(grade)) * Crr;

        const f_drag = 0.5 * rho * CdA * targetSpeedMps * targetSpeedMps;
        return (forceRolling + forceGravity + f_drag) * targetSpeedMps;
    }
};