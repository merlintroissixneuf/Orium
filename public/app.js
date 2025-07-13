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
        // ... (This function is unchanged)
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
            <div id="registerView" class="auth-form hidden"> <form id="registerForm"> <h3>Register</h3> <input type="text" id="registerUsername" placeholder="Username" required> <input type="email" id="registerEmail" placeholder="Email" required> <input type="password" id="registerPassword" placeholder="Password" required> <button type="submit">Create Account</button> <div class="toggle-link"><a id="showLogin">Back to Login</a></div> </form> </div> <div id="forgotPasswordView" class="auth-form hidden"> <form id="forgotPasswordForm"> <h3>Forgot Password</h3> <p style="font-size: 0.8em; text-align: center; margin-top: 0;">Enter your email and we'll send you a reset link.</p> <input type="email" id="forgotEmail" placeholder="Email" required> <button type="submit">Send Reset Link</button> <div class="toggle-link"><a id="showLoginFromForgot">Back to Login</a></div> </form> </div>
        `;
        attachAuthFormListeners();
    };


    // --- Listener Attachment ---

    const attachLobbyListeners = () => {
        document.getElementById('logoutButton').addEventListener('click', () => {
            localStorage.removeItem('authToken');
            if (pollingInterval) clearInterval(pollingInterval);
            fetchAndRenderLobby();
        });

        const playButton = document.getElementById('playMayhemButton');
        const mayhemMessage = document.getElementById('mayhemMessage');

        playButton.addEventListener('click', async () => {
            const token = localStorage.getItem('authToken');
            console.log('Play button clicked.');

            // --- JOIN QUEUE LOGIC ---
            if (playButton.textContent === 'Play') {
                playButton.disabled = true;
                mayhemMessage.textContent = 'Joining queue...';
                mayhemMessage.className = 'success';
                console.log('Attempting to join matchmaking...');

                try {
                    const response = await fetch('/api/matchmaking/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                    });

                    const data = await response.json();
                    console.log('Received response from /join:', response.status, data);

                    if (response.ok) {
                        mayhemMessage.textContent = 'In queue, waiting for players...';
                        playButton.textContent = 'Cancel';
                        playButton.style.borderColor = '#FF0000'; // Red border for cancel
                        playButton.disabled = false; // Re-enable to allow cancelling
                        pollingInterval = setInterval(checkMatchmakingStatus, 2000);
                    } else if (response.status === 409) {
                        // EXPLICITLY HANDLE "ALREADY IN QUEUE" ERROR
                        mayhemMessage.textContent = `Error: ${data.message}`;
                        mayhemMessage.className = 'error';
                        console.error('State conflict:', data.message);
                        // Force UI to correct "Cancel" state
                        playButton.textContent = 'Cancel';
                        playButton.style.borderColor = '#FF0000';
                        playButton.disabled = false;
                        // Start polling just in case we are in a ghost queue
                        if (!pollingInterval) {
                           pollingInterval = setInterval(checkMatchmakingStatus, 2000);
                        }
                    } else {
                        // Handle all other server errors
                        throw new Error(data.message || 'An unknown error occurred.');
                    }
                } catch (error) {
                    console.error('Failed to join queue:', error);
                    mayhemMessage.textContent = `Error: ${error.message}`;
                    mayhemMessage.className = 'error';
                    playButton.disabled = false; // ALWAYS re-enable button on failure
                }

            // --- LEAVE QUEUE LOGIC ---
            } else {
                playButton.disabled = true;
                mayhemMessage.textContent = 'Leaving queue...';
                console.log('Attempting to leave matchmaking...');

                try {
                    await fetch('/api/matchmaking/leave', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    console.log('Successfully left queue.');
                    if (pollingInterval) clearInterval(pollingInterval);
                    pollingInterval = null;
                    mayhemMessage.textContent = 'You have left the queue.';
                    mayhemMessage.className = '';
                    playButton.textContent = 'Play';
                    playButton.style.borderColor = '#00FF00'; // Green border for play
                    
                } catch (error) {
                    console.error('Error leaving queue:', error);
                    mayhemMessage.textContent = 'Error leaving queue.';
                    mayhemMessage.className = 'error';
                } finally {
                    playButton.disabled = false; // ALWAYS re-enable button
                }
            }
        });
    };
    
    const checkMatchmakingStatus = async () => {
        console.log('Polling for match status...');
        try {
            const response = await fetch('/api/matchmaking/status', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await response.json();
            if (data.status === 'found') {
                console.log('Match found! Redirecting to arena for matchId:', data.matchId);
                clearInterval(pollingInterval);
                pollingInterval = null;
                window.location.href = `/arena.html?matchId=${data.matchId}`;
            }
            // No 'else' needed, just continues polling if not found
        } catch (error) {
            console.error('Error polling for match status:', error);
            const mayhemMessage = document.getElementById('mayhemMessage');
            if(mayhemMessage){
                mayhemMessage.textContent = 'Error: Disconnected from queue. Please try again.';
                mayhemMessage.className = 'error';
            }
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    };

    const attachAuthFormListeners = () => {
        // ... (This function is unchanged)
        const loginView = document.getElementById('loginView');
        const registerView = document.getElementById('registerView');
        const forgotPasswordView = document.getElementById('forgotPasswordView');
        const messageDiv = document.getElementById('message');
        const loadingDiv = document.getElementById('loading');
        const showView = (viewToShow) => { [loginView, registerView, forgotPasswordView].forEach(view => view.classList.add('hidden')); viewToShow.classList.remove('hidden'); messageDiv.textContent = ''; messageDiv.className = ''; };
        document.getElementById('showRegister').addEventListener('click', () => showView(registerView));
        document.getElementById('showLogin').addEventListener('click', () => showView(loginView));
        document.getElementById('showForgotPassword').addEventListener('click', () => showView(forgotPasswordView));
        document.getElementById('showLoginFromForgot').addEventListener('click', () => showView(loginView));
        const showLoading = () => loadingDiv.classList.remove('hidden');
        const hideLoading = () => loadingDiv.classList.add('hidden');
        const rememberToggle = document.getElementById('rememberToggle');
        rememberToggle.addEventListener('click', () => { const isActive = rememberToggle.classList.toggle('active'); localStorage.setItem('remembered', isActive); });
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', async (event) => { event.preventDefault(); showLoading(); const identifier = document.getElementById('loginIdentifier').value; const password = document.getElementById('loginPassword').value; const remember = rememberToggle.classList.contains('active'); try { const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }), }); const data = await response.json(); if (response.ok && data.token) { localStorage.setItem('authToken', data.token); if (remember) { localStorage.setItem('savedUsername', identifier); localStorage.setItem('savedPassword', password); } else { localStorage.removeItem('savedUsername'); localStorage.removeItem('savedPassword'); localStorage.removeItem('remembered'); } fetchAndRenderLobby(); } else { throw new Error(data.message || 'Invalid credentials.'); } } catch (error) { console.error('Login error:', error); messageDiv.textContent = 'Error: ' + error.message; messageDiv.className = 'error'; } finally { hideLoading(); } });
        const registerForm = document.getElementById('registerForm');
        registerForm.addEventListener('submit', async(event) => { /* unchanged */ });
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        forgotPasswordForm.addEventListener('submit', async (event) => { /* unchanged */ });
    };

    // --- Initial Load ---
    fetchAndRenderLobby();
});