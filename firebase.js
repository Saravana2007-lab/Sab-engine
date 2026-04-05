// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAcvZOqLqYcZPt6eQdV5L49K5GctMRiNGM",
  authDomain: "sabengine-34c71.firebaseapp.com",
  projectId: "sabengine-34c71",
  storageBucket: "sabengine-34c71.firebasestorage.app",
  messagingSenderId: "184067638188",
  appId: "1:184067638188:web:384cfe32358ed1c452b009"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);