/**
 * UNIFIED LICENSE SYSTEM - CLIENT SIDE
 * Handles: UI, Validation, Real-time Kill-switch, and Domain Locking.
 */
(function () {
    // 1. Firebase Configuration (Matches your Admin/Auth)
    const firebaseConfig = {
        apiKey: "AIzaSyAMnnp5WiV3HAlPSUX73GqG6zxwQRXSpuA",
        authDomain: "lickey-33267.firebaseapp.com",
        databaseURL: "https://lickey-33267-default-rtdb.firebaseio.com",
        projectId: "lickey-33267",
        storageBucket: "lickey-33267.firebasestorage.app",
        messagingSenderId: "283310739978",
        appId: "1:283310739978:web:bc2887db5e9ce5d9ec05f3",
        measurementId: "G-1ZZ1RRZKB2"
    };

    // 2. Load Firebase Compatibility Scripts Dynamically
    function loadFirebase(callback) {
        if (window.firebase) return callback();
        const s1 = document.createElement("script");
        s1.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js";
        s1.onload = () => {
            const s2 = document.createElement("script");
            s2.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js";
            s2.onload = callback;
            document.head.appendChild(s2);
        };
        document.head.appendChild(s1);
    }

    function init() {
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        const storedKey = localStorage.getItem("licenseKey");

        // Helper: Sync with Firebase Server Time (Prevents Local Clock Cheating)
        function getServerTime() {
            return new Promise((res) => {
                db.ref("/.info/serverTimeOffset").once("value", (snap) => {
                    res(Date.now() + (snap.val() || 0));
                });
            });
        }

        // UI: Style Injection
        const injectStyles = () => {
            if (document.getElementById('lic-styles')) return;
            const style = document.createElement("style");
            style.id = 'lic-styles';
            style.innerHTML = `
                .lic-wrap { position:fixed; top:0; left:0; width:100%; height:100vh; background:#0f0c29; background:linear-gradient(to bottom, #24243e, #1a1a2e, #0f0c29); display:flex; justify-content:center; align-items:center; z-index:9999999; font-family: 'Segoe UI', Tahoma, sans-serif; color: white; }
                .lic-box { background:#16213e; padding:3rem; border-radius:20px; box-shadow:0 20px 50px rgba(0,0,0,0.6); width:90%; max-width:420px; text-align:center; border:1px solid #e94560; }
                .lic-box h2 { margin:0 0 10px; color:#e94560; font-size:1.8rem; }
                .lic-box p { color: #94a3b8; margin-bottom: 25px; }
                .lic-in { width:100%; padding:14px; margin-bottom:20px; border-radius:10px; border:1px solid #0f3460; background:#1a1a2e; color:white; font-size:1.1rem; text-align:center; box-sizing:border-box; outline:none; }
                .lic-in:focus { border-color: #e94560; box-shadow: 0 0 10px rgba(233, 69, 96, 0.3); }
                .lic-btn { background:#e94560; color:white; border:none; padding:14px; border-radius:10px; cursor:pointer; font-weight:bold; width:100%; font-size:1rem; text-transform:uppercase; letter-spacing:1px; transition: 0.3s; }
                .lic-btn:hover { background:#ff4d6d; transform: translateY(-2px); }
                .lic-status { margin-top:20px; font-weight: 500; min-height: 24px; }
                .t-err { color:#ff4e4e; } .t-ok { color:#4eff8a; }
            `;
            document.head.appendChild(style);
        };

        // UI: Display the Activation Overlay
        function showUI(msg = "Enter your license key to continue", isErr = false) {
            injectStyles();
            // Prevent scrolling behind the overlay
            document.body.style.overflow = "hidden";
            
            document.body.innerHTML = `
                <div class="lic-wrap">
                    <div class="lic-box">
                        <h2>🔐 System Locked</h2>
                        <p id="lic-p-msg">${msg}</p>
                        <input type="text" id="lic-field" class="lic-in" placeholder="XXXX-XXXX-XXXX-XXXX">
                        <button class="lic-btn" onclick="window.verifyAction()">Activate System</button>
                        <div id="lic-info" class="lic-status ${isErr ? 't-err' : ''}"></div>
                    </div>
                </div>
            `;

            window.verifyAction = async () => {
                const key = document.getElementById('lic-field').value.trim();
                const info = document.getElementById('lic-info');
                if (!key) return info.innerHTML = "❌ Please enter a key.";
                info.className = "lic-status";
                info.innerHTML = "⌛ Verifying license...";
                validate(key, true);
            };
        }

        // Core Logic: Validation
        async function validate(key, isManual = false) {
            try {
                const snap = await db.ref("licenses/" + key).once("value");
                const data = snap.val();
                const now = await getServerTime();

                // 1. Check if key exists
                if (!data) throw new Error("Key not found in database.");

                // 2. Check Status
                if (data.status !== "active") throw new Error("This license has been disabled.");

                // 3. Check Expiry
                if (data.expiry && now > data.expiry) throw new Error("License expired on " + new Date(data.expiry).toLocaleDateString());

                // 4. Check Domain Locking (if set in Admin)
                const currentHost = window.location.hostname;
                if (data.domain && data.domain !== "" && data.domain !== "localhost") {
                    if (currentHost !== data.domain) throw new Error("This key is locked to: " + data.domain);
                }

                // Success Actions
                localStorage.setItem("licenseKey", key);
                
                if (isManual) {
                    const info = document.getElementById('lic-info');
                    info.className = "lic-status t-ok";
                    info.innerHTML = `✅ Welcome, ${data.user || 'Authorized User'}!`;
                    setTimeout(() => location.reload(), 1500);
                } else {
                    // Start the real-time listener for "Live Kill-switch"
                    startKiller(key);
                }

            } catch (e) {
                localStorage.removeItem("licenseKey");
                if (isManual) {
                    const info = document.getElementById('lic-info');
                    info.className = "lic-status t-err";
                    info.innerHTML = "❌ " + e.message;
                } else {
                    showUI(e.message, true);
                }
            }
        }

        // Kill-switch: Listens for changes while user is browsing
        function startKiller(key) {
            db.ref("licenses/" + key).on("value", async (snap) => {
                const data = snap.val();
                const now = await getServerTime();
                
                const isInvalid = !data || 
                                  data.status !== "active" || 
                                  (data.expiry && now > data.expiry);

                if (isInvalid) {
                    localStorage.removeItem("licenseKey");
                    location.reload(); // Force trigger showUI
                }
            });
        }

        // Entry Logic
        if (!storedKey) {
            showUI();
        } else {
            validate(storedKey);
        }
    }

    // Run
    loadFirebase(init);
})();