# 🏨 Hotel Management System — Firebase Realtime Database

Full-featured hotel system using **Firebase Realtime Database** (not Firestore).

---

## ✅ Features
- 🔐 Login — Firebase Auth (email/password)
- 📊 Dashboard — Live stats, guests, revenue
- 🚪 Rooms — Add/edit/delete, real-time status
- 📅 Bookings — Immediate check-in OR pre-booking
- 👥 Customers — Full history
- 🧾 Billing — Auto-calculate + extra charges
- 🖨️ Invoice — A4 + Thermal 80mm print
- 📈 Reports — Daily/Monthly/Annual + Charts
- 📤 Export — Excel (XLSX)
- 📡 Real-time sync across all devices
- 🌍 Global access via Firebase Hosting

---

## 🚀 Setup Steps

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com
2. Create new project
3. Enable **Realtime Database** → Create database → Start in test mode
4. Enable **Authentication** → Email/Password → Add your admin user

### Step 2: Get Your Config
1. Project Settings → Your apps → Web → Register app
2. Copy the `firebaseConfig` object

### Step 3: Update config.js
Open `public/js/config.js` and fill in:
```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",  // ← important!
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

const HOTEL = {
  name:     "Your Hotel Name",
  address:  "Your Address",
  phone:    "+91 XXXXX XXXXX",
  email:    "info@yourhotel.com",
  currency: "₹"   // ← change to $, £, € etc.
};
```

### Step 4: Apply Database Rules
1. Firebase Console → Realtime Database → Rules tab
2. Replace all content with:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "rooms": {
      ".indexOn": ["roomNumber"]
    },
    "bookings": {
      ".indexOn": ["checkIn"]
    },
    "bills": {
      ".indexOn": ["createdAt"]
    }
  }
}
```
3. Click Publish

### Step 5: Deploy (Global Access)
```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy
```
Live at: `https://YOUR_PROJECT.web.app`

### Step 6: Local Testing
Open `public/index.html` directly in browser — it connects to Firebase live.
Or: `python -m http.server 8080` inside the `public/` folder.

---

## 📁 Structure
```
hotel-rtdb/
├── database.rules.json    ← Your exact RTDB rules
├── firebase.json          ← Hosting config
├── .firebaserc            ← Project ID
├── README.md
└── public/
    ├── index.html         ← Login page
    ├── app.html           ← Full application
    ├── invoice.html       ← Print invoice
    ├── css/style.css      ← Dark luxury UI
    └── js/
        ├── config.js      ← 🔑 YOUR KEYS HERE
        └── app.js         ← All logic (RTDB)
```

---

## 📋 Database Structure (Realtime DB)
```
/rooms/{id}
  roomNumber, roomType, pricePerDay, status, description, createdAt, updatedAt

/bookings/{id}
  guestName, guestPhone, idProof, address
  roomId, roomNumber, roomPrice, roomType
  checkIn (timestamp ms), checkOut (timestamp ms)
  type (checkin|reservation), status (checked_in|reserved|checked_out)
  createdAt, updatedAt

/bills/{id}
  bookingId, guestName, guestPhone, idProof, address
  roomId, roomNumber, roomType, roomPrice
  daysStayed, checkIn, checkOut
  roomCharges, extraItems[], extraTotal, totalAmount
  paymentMode, notes, createdAt
```

---

## 🔑 Important: databaseURL
The `databaseURL` field in config.js is **required** for Realtime Database.
Format: `https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com`
Find it in: Firebase Console → Realtime Database → Data tab (top URL)
