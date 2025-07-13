document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.querySelector('.container');
    let pollingInterval = null;

    // --- Core View Rendering ---

    const fetchAndRenderLobby = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            renderLoginView();
            return;
        }
        try {
            const response = await fetch('/api/user/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const userData = await response.json();
                renderLobbyView(userData);
            } else {
                localStorage.clear(); // Clear all stale data on auth failure
                renderLoginView();
            }
        } catch (error) {
            console.error('Failed to fetch user data:', error);
            renderLoginView();
        }
    };

    const renderLobbyView = (userData) => {
        mainContainer.innerHTML = `
            <div class="header">
                <div class="user-info">
                    <div class="username">${userData.username}</div>
                    <div class="wallet">
                        <span>${Number(userData.hype_token_balance).toLocaleString()} HT</span> | 
                        <span>${Number(userData.orium_shard_balance).toLocaleString()} OS</span>
                    </div>
                </div>
                <button class="logout-btn" id="logoutButton">Logout</button>
            </div>
            <h2>Select Game</h2>
            <div class="game-modes">
                <div class="game-tile" id="mayhemTile">
                    <h3>Meme Stock Mayhem</h3>
                    <p>Join the battle of BULLS vs BEARS. Push the price in your faction's favor!</p>
                    <button id="playMayhemButton">Play</button>
                    <div id="mayhemMessage" style="margin-top: 1rem; font-size: 0.7em;"></div>
                </div>
                <div class="game-tile">
                    <h3>Crystal Ball</h3>
                    <p>Predict the future price of real-world assets and multiply your Orium Shards.</p>
                    <button disabled>Coming Soon</button>
                </div>
            </div>
        `;
        attachLobbyListeners();
    };

    const renderLoginView = () => {
        // Reads saved credentials and preference from localStorage to pre-fill the form
        const savedUsername = localStorage.getItem('savedUsername') || '';
        const savedPassword = localStorage.getItem('savedPassword') || '';
        const isRemembered = localStorage.getItem('remembered') === 'true';

        mainContainer.innerHTML = `
            <h2>🪨 Orium.fun</h2>
            <div id="loginView" class="auth-form">
                <form id="loginForm">
                    <h3>Login</h3>
                    <input type="text" id="loginIdentifier" placeholder="Username or Email" value="${savedUsername}" required>
                    <input type="password" id="loginPassword" placeholder="Password" value="${savedPassword}" required>
                    <div class="remember-toggle ${isRemembered ? 'active' : ''}" id="rememberToggle">
                        <span class="toggle-label">Remember Me</span>
                    </div>
                    <button type="submit">Login</button>
                    <div class="toggle-link"><a id="showForgotPassword">Forgot Password?</a></div>
                    <div class="toggle-link">Don't have an account? <a id="showRegister">Register here</a></div>
                </form>
            </div>
            <div id="message"></div>
            <div id="loading" class="hidden">Processing...</div>
            
            <!-- Other auth views are injected below and hidden by default -->
            <div id="registerView" class="auth-form hidden">
                <form id="registerForm">
                    <h3>Register</h3>
                    <input type="text" id="registerUsername" placeholder="Username" required>
                    <input type="email" id="registerEmail" placeholder="Email" required>
                    <input type="password" id="registerPassword" placeholder="Password" required>
                    <button type="submit">Create Account</button>
                    <div class="toggle-link"><a id="showLogin">Back to Login</a></div>
                </form>
            </div>
            <div id="forgotPasswordView" class="auth-form hidden">
                <form id="forgotPasswordForm">
                    <h3>Forgot Password</h3>
                    <p style="font-size: 0.8em; text-align: center; margin-top: 0;">Enter your email and we'll send you a reset link.</p>
                    <input type="email" id="forgotEmail" placeholder="Email" required>
                    <button type="submit">Send Reset Link</button>
                    <div class="toggle-link"><a id="showLoginFromForgot">Back to Login</a></div>
                </form>
            </div>
        `;
        attachAuthFormListeners();
    };


    // --- Listener Attachment ---

    const attachLobbyListeners = () => {
        document.getElementById('logoutButton').addEventListener('click', () => {
            // Only remove the auth token, preserving "remember me" credentials.
            localStorage.removeItem('authToken');
            if (pollingInterval) clearInterval(pollingInterval);
            fetchAndRenderLobby();
        });

        const playButton = document.getElementById('playMayhemButton');
        const mayhemMessage = document.getElementById('mayhemMessage');

        playButton.addEventListener('click', async () => {
            if (playButton.textContent === 'Play') {
                // ... (matchmaking join logic is unchanged)
            } else {
                // ... (matchmaking leave logic is unchanged)
            }
        });
    };

    const attachAuthFormListeners = () => {
        const loginView = document.getElementById('loginView');
        const registerView = document.getElementById('registerView');
        const forgotPasswordView = document.getElementById('forgotPasswordView');
        const messageDiv = document.getElementById('message');
        const loadingDiv = document.getElementById('loading');
        
        // --- View Toggling ---
        const showView = (viewToShow) => {
            [loginView, registerView, forgotPasswordView].forEach(view => view.classList.add('hidden'));
            viewToShow.classList.remove('hidden');
            messageDiv.textContent = '';
            messageDiv.className = '';
        };

        document.getElementById('showRegister').addEventListener('click', () => showView(registerView));
        document.getElementById('showLogin').addEventListener('click', () => showView(loginView));
        document.getElementById('showForgotPassword').addEventListener('click', () => showView(forgotPasswordView));
        document.getElementById('showLoginFromForgot').addEventListener('click', () => showView(loginView));

        // --- Form Submissions & "Remember Me" Logic ---
        const showLoading = () => loadingDiv.classList.remove('hidden');
        const hideLoading = () => loadingDiv.classList.add('hidden');

        // REMEMBER ME: Attach listener to the toggle
        const rememberToggle = document.getElementById('rememberToggle');
        rememberToggle.addEventListener('click', () => {
            const isActive = rememberToggle.classList.toggle('active');
            // Immediately save the user's preference to localStorage.
            localStorage.setItem('remembered', isActive);
        });

        // LOGIN FORM
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            showLoading();
            const identifier = document.getElementById('loginIdentifier').value;
            const password = document.getElementById('loginPassword').value;
            const remember = rememberToggle.classList.contains('active');

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier, password }),
                });
                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('authToken', data.token);
                    
                    // REMEMBER ME (FIXED): Handle saving/clearing credentials on successful login
                    if (remember) {
                        localStorage.setItem('savedUsername', identifier);
                        localStorage.setItem('savedPassword', password);
                    } else {
                        // If not remembered, clear all related items for a clean slate.
                        localStorage.removeItem('savedUsername');
                        localStorage.removeItem('savedPassword');
                        localStorage.removeItem('remembered');
                    }
                    fetchAndRenderLobby();
                } else {
                    messageDiv.textContent = 'Error: ' + data.message;
                    messageDiv.className = 'error';
                }
            } catch (error) {
                console.error('Login error:', error);
                messageDiv.textContent = 'Error: Failed to login. Please try again.';
                messageDiv.className = 'error';
            } finally {
                hideLoading();
            }
        });

        // REGISTER FORM
        const registerForm = document.getElementById('registerForm');
        registerForm.addEventListener('submit', async (event) => {
            // ... (register logic is unchanged)
        });

        // FORGOT PASSWORD FORM
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        forgotPasswordForm.addEventListener('submit', async (event) => {
            // ... (forgot password logic is unchanged)
        });
    };

    // --- Initial Load ---
    fetchAndRenderLobby();
});