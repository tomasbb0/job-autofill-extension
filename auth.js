// Authentication Module for Job AutoFill Extension
// Supports Google and Apple Sign-In with Firebase Authentication
// User data is stored per-user in Firebase Realtime Database

(function () {
  "use strict";

  // Firebase configuration for job-autofill-extension
  // This is a NEW Firebase project specifically for this extension
  const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY", // To be replaced with actual key
    authDomain: "job-autofill-extension.firebaseapp.com",
    databaseURL: "https://job-autofill-extension-default-rtdb.firebaseio.com",
    projectId: "job-autofill-extension",
    storageBucket: "job-autofill-extension.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  };

  window.AuthManager = {
    // State
    user: null,
    isInitialized: false,
    listeners: [],
    db: null,
    auth: null,

    // Initialize Firebase Auth
    async init() {
      if (this.isInitialized) return;

      try {
        // Load Firebase scripts
        await this.loadFirebaseScripts();

        // Initialize Firebase
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }

        this.auth = firebase.auth();
        this.db = firebase.database();

        // Listen for auth state changes
        this.auth.onAuthStateChanged((user) => {
          this.user = user;
          this.notifyListeners(user);

          if (user) {
            console.log(
              "[Auth] User signed in:",
              user.email || user.displayName,
            );
            this.syncUserData();
          } else {
            console.log("[Auth] User signed out");
          }
        });

        this.isInitialized = true;
        console.log("[Auth] Initialized successfully");
      } catch (err) {
        console.error("[Auth] Initialization error:", err);
      }
    },

    // Load Firebase scripts dynamically
    async loadFirebaseScripts() {
      const scripts = [
        "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js",
        "https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js",
      ];

      for (const src of scripts) {
        if (document.querySelector(`script[src="${src}"]`)) continue;

        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
    },

    // Sign in with Google
    async signInWithGoogle() {
      if (!this.auth) await this.init();

      try {
        const provider = new firebase.auth.GoogleAuthProvider();

        // For Chrome extensions, we need to use chrome.identity
        // This is because popup-based auth doesn't work well in extensions

        // Get OAuth token via chrome.identity
        const token = await this.getGoogleAuthToken();

        if (token) {
          const credential = firebase.auth.GoogleAuthProvider.credential(
            null,
            token,
          );
          const result = await this.auth.signInWithCredential(credential);
          return { success: true, user: result.user };
        } else {
          return { success: false, error: "Failed to get auth token" };
        }
      } catch (err) {
        console.error("[Auth] Google sign-in error:", err);
        return { success: false, error: err.message };
      }
    },

    // Get Google auth token using chrome.identity
    async getGoogleAuthToken() {
      return new Promise((resolve, reject) => {
        // Check if we're in a Chrome extension context
        if (typeof chrome !== "undefined" && chrome.identity) {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Auth] Chrome identity error:",
                chrome.runtime.lastError,
              );
              reject(chrome.runtime.lastError);
            } else {
              resolve(token);
            }
          });
        } else {
          // Fallback for non-extension context (testing)
          reject(new Error("Chrome identity API not available"));
        }
      });
    },

    // Sign in with Apple
    async signInWithApple() {
      if (!this.auth) await this.init();

      try {
        const provider = new firebase.auth.OAuthProvider("apple.com");
        provider.addScope("email");
        provider.addScope("name");

        // For Chrome extensions, Apple Sign-In is more complex
        // It requires a web-based OAuth flow
        const result = await this.auth.signInWithPopup(provider);
        return { success: true, user: result.user };
      } catch (err) {
        console.error("[Auth] Apple sign-in error:", err);
        return { success: false, error: err.message };
      }
    },

    // Sign out
    async signOut() {
      if (!this.auth) return;

      try {
        // Revoke Google token if using chrome.identity
        if (typeof chrome !== "undefined" && chrome.identity) {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (token) {
              chrome.identity.removeCachedAuthToken({ token }, () => {
                console.log("[Auth] Google token revoked");
              });
            }
          });
        }

        await this.auth.signOut();
        return { success: true };
      } catch (err) {
        console.error("[Auth] Sign out error:", err);
        return { success: false, error: err.message };
      }
    },

    // Add auth state listener
    onAuthStateChanged(callback) {
      this.listeners.push(callback);
      // Immediately call with current state
      if (this.user !== undefined) {
        callback(this.user);
      }

      // Return unsubscribe function
      return () => {
        this.listeners = this.listeners.filter((l) => l !== callback);
      };
    },

    // Notify all listeners
    notifyListeners(user) {
      this.listeners.forEach((callback) => {
        try {
          callback(user);
        } catch (err) {
          console.error("[Auth] Listener error:", err);
        }
      });
    },

    // Sync user data from Firebase to local storage
    async syncUserData() {
      if (!this.user || !this.db) return;

      try {
        const userId = this.user.uid;
        const snapshot = await this.db
          .ref(`users/${userId}/profile`)
          .once("value");
        const cloudData = snapshot.val();

        if (cloudData) {
          // Merge cloud data with local data
          const localData = await chrome.storage.sync.get(null);
          const mergedData = { ...localData, ...cloudData };
          await chrome.storage.sync.set(mergedData);
          console.log("[Auth] Synced user data from cloud");
        } else {
          // First time user - upload local data to cloud
          await this.uploadUserData();
        }
      } catch (err) {
        console.error("[Auth] Sync error:", err);
      }
    },

    // Upload local data to Firebase
    async uploadUserData() {
      if (!this.user || !this.db) return;

      try {
        const userId = this.user.uid;
        const localData = await chrome.storage.sync.get(null);

        // Store user profile
        await this.db.ref(`users/${userId}/profile`).set({
          ...localData,
          updatedAt: firebase.database.ServerValue.TIMESTAMP,
        });

        // Store user metadata
        await this.db.ref(`users/${userId}/meta`).set({
          email: this.user.email,
          displayName: this.user.displayName,
          photoURL: this.user.photoURL,
          provider: this.user.providerData[0]?.providerId,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
        });

        console.log("[Auth] Uploaded user data to cloud");
      } catch (err) {
        console.error("[Auth] Upload error:", err);
      }
    },

    // Save specific data to cloud (called when user updates profile)
    async saveToCloud(key, value) {
      if (!this.user || !this.db) return;

      try {
        const userId = this.user.uid;
        await this.db.ref(`users/${userId}/profile/${key}`).set(value);
        console.log(`[Auth] Saved ${key} to cloud`);
      } catch (err) {
        console.error("[Auth] Save error:", err);
      }
    },

    // Get current user info
    getCurrentUser() {
      if (!this.user) return null;

      return {
        uid: this.user.uid,
        email: this.user.email,
        displayName: this.user.displayName,
        photoURL: this.user.photoURL,
        isSignedIn: true,
      };
    },

    // Check if user is signed in
    isSignedIn() {
      return !!this.user;
    },
  };

  // Auto-initialize when loaded
  if (typeof chrome !== "undefined" && chrome.storage) {
    AuthManager.init().catch(console.error);
  }
})();
