# Firebase Setup Instructions

To enable cloud functionality, you need to set up a free Firebase project.

## 1. Create Project
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **"Add project"**.
3. Name it `youtube-interface-cloud` (or anything you like).
4. Disable Google Analytics (simplifies setup) and click **"Create project"**.

## 2. Enable Authentication
1. In the project dashboard, click **"Build"** -> **"Authentication"** in the sidebar.
2. Click **"Get started"**.
3. Select **"Google"** from the Sign-in method list.
4. Click **"Enable"**.
5. Select your support email and click **"Save"**.

## 3. Enable Database
1. Click **"Build"** -> **"Firestore Database"** in the sidebar.
2. Click **"Create database"**.
3. Choose a location (e.g., `eur3` for Europe or `nam5` for US).
4. **Select Database Option**: Choose **Standard edition** (Simple query engine).
    - *Note: We do not need Enterprise/MongoDB compatibility. We will store images in Storage, not the Database.*
5. **Important**: Start in **Test mode** (allows read/write for 30 days, we will secure it later).
6. Click **"Create"**.

## 4. Get Configuration
1. Click the **Gear icon** (Project settings) next to "Project Overview" in the sidebar.
2. Scroll down to "Your apps" and click the **Web icon (`</>`)**.
3. Register app with nickname `web-client`. Also check **"Also set up Firebase Hosting"** (select the site from dropdown if asked, usually default).
4. Click **"Register app"**.
5. You will see a `firebaseConfig` object. **Copy the contents** (apiKey, authDomain, etc.).

## 5. Provide Credentials
Create a file named `src/firebaseConfig.ts` in your project and paste the config like this:

```typescript
// src/firebaseConfig.ts
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Once you have done this, please let me know!
