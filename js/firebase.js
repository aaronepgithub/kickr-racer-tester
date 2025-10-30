import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDoc, updateDoc, serverTimestamp, query, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


import { firebaseConfig, appId } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import { UIController } from './ui.js';

export const FirebaseController = {
    db: null,
    auth: null,

    async init() {

        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);

            await this.authenticate();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            DOMElements.raceStatus.textContent = "Firebase Error";
        }
    },

    authenticate() {
        return signInAnonymously(this.auth).catch(error => {
            console.error("Anonymous sign-in failed:", error);
        });
    },

    async getCourses() {
        if (!this.db) return [];
        try {
            const coursesCol = collection(this.db, `artifacts/${appId}/public/data/courses`);
            const courseSnapshot = await getDocs(coursesCol);
            const courseList = courseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return courseList;
        } catch (e) {
            console.error("Error fetching courses: ", e);
            return [];
        }
    },

    async uploadCourse(courseData) {
        if (!this.db) return null;
        try {
            const docRef = await addDoc(collection(this.db, `artifacts/${appId}/public/data/courses`), {
                name: courseData.name,
                gpx: JSON.stringify(courseData.route),
                totalDistance: courseData.totalDistance,
                checkpoints: courseData.checkpoints,
                createdAt: serverTimestamp(),
                recordRun: null, // No record run initially
            });
            console.log("Course uploaded with ID: ", docRef.id);
            return docRef.id;
        } catch (e) {
            console.error("Error uploading course: ", e);
            return null;
        }
    },

    async saveRun(courseId, runData) {
        if (!this.db) return;

        const courseRef = doc(this.db, `artifacts/${appId}/public/data/courses`, courseId);
        try {
            const courseSnap = await getDoc(courseRef);
            if (!courseSnap.exists()) {
                console.error("Course not found for saving run.");
                return;
            }

            const courseData = courseSnap.data();
            const currentRecord = courseData.recordRun;

            if (!currentRecord || runData.totalTime < currentRecord.totalTime) {
                // New record!
                await updateDoc(courseRef, {
                    recordRun: {
                        runnerName: runData.runnerName,
                        totalTime: runData.totalTime,
                        checkpointTimes: runData.checkpointTimes,
                        achievedAt: serverTimestamp(),
                    }
                });
                console.log("New record set for course:", courseId);
                console.log(runData.runnerName);
                // UIController.displayRecordTimes(runData.runnerName);
            }
        } catch (e) {
            console.error("Error saving run: ", e);
        }
    },

    async saveHighScore(courseId, highScoreData) {
        if (!this.db) return;

        const courseRef = doc(this.db, `artifacts/${appId}/public/data/courses`, courseId);
        try {
            await updateDoc(courseRef, {
                highScore: {
                    name: highScoreData.name,
                    points: highScoreData.points,
                    achievedAt: serverTimestamp(),
                }
            });
            console.log("New high score set for course:", courseId);
        } catch (e) {
            console.error("Error saving high score: ", e);
        }
    }
};
