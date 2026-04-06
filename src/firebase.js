import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB-PwUlSIu2OpO4rk0aYi208RyNrqTUkJk",
  authDomain: "runy-dic-admin.firebaseapp.com",
  databaseURL: "https://runy-dic-admin-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "runy-dic-admin",
  storageBucket: "runy-dic-admin.firebasestorage.app",
  messagingSenderId: "197924411491",
  appId: "1:197924411491:web:9dbdd5e84e2755bb28c056"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)