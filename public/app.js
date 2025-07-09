document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.querySelector('.container');
    let pollingInterval = null;

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
                localStorage.removeItem('authToken');
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
        mainContainer.innerHTML = `
            <h2>Login</h2>
            <form id="loginForm">
                <input type="email" id="loginEmail" placeholder="Email" required>
                <input type="password" id="loginPassword" placeholder="Password" required>
                <button type="submit">Login</button>
            </form>
            <div class="toggle-link"><a id="showForgotPassword">Forgot Password?</a></div>
            <div class="toggle-link">Don't have an account? <a id="showRegister">Register here</a></div>
            <div id="message"></div>
        `;
        addAuthView();
    };

    const addAuthView = () => {
        const existingContainer = document.querySelector('.container');
        const authHTML = `<div id="registerView" class="hidden"><h2>Register</h2><form id="registerForm"><input type="text" id="registerUsername" placeholder="Username" required><input type="email" id="registerEmail" placeholder="Email" required><input type="password" id="registerPassword" placeholder="Password" required><button type="submit">Create Account</button></form><div class="toggle-link">Already have an account? <a id="showLogin">Login here</a></div></div><div id="forgotPasswordView" class="hidden"><h2>Forgot Password</h2><form id="forgotPasswordForm"><p style="font-size: 0.8em; text-align: center; margin-top: 0;">Enter your email and we'll send you a reset link.</p><input type="email" id="forgotEmail" placeholder="Email" required><button type="submit">Send Reset Link</button></form><div class="toggle-link">Remembered your password? <a id="showLoginFromForgot">Login here</a></div></div>`;
        const messageDiv = document.getElementById('message');
        if (messageDiv) { messageDiv.insertAdjacentHTML('beforebegin', authHTML); } else { existingContainer.innerHTML += authHTML; }
        attachAuthFormListeners();
    };

    const attachLobbyListeners = () => {
        document.getElementById('logoutButton').addEventListener('click', () => {
            localStorage.removeItem('authToken');
            if (pollingInterval) clearInterval(pollingInterval);
            fetchAndRenderLobby();
        });

        const playButton = document.getElementById('playMayhemButton');
        const mayhemMessage = document.getElementById('mayhemMessage');

        playButton.addEventListener('click', async () => {
            if (playButton.textContent === 'Play') {
                playButton.disabled = true;
                mayhemMessage.textContent = 'Joining queue...';
                mayhemMessage.className = 'success';
                try {
                    const response = await fetch('/api/matchmaking/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                    });
                    const data = await response.json();
                    if (response.ok) {
                        mayhemMessage.textContent = 'In queue, waiting...';
                        playButton.textContent = 'Cancel';
                        playButton.style.borderColor = '#FF0000';
                        playButton.disabled = true;
                        setTimeout(() => { playButton.disabled = false; }, 5000);
                        pollingInterval = setInterval(checkMatchmakingStatus, 2000);
                    } else {
                        mayhemMessage.textContent = `Error: ${data.message}`;
                        mayhemMessage.className = 'error';
                        playButton.disabled = false;
                    }
                } catch (error) {
                    console.error('Error joining queue:', error);
                    mayhemMessage.textContent = 'Error: Failed to join queue.';
                    mayhemMessage.className = 'error';
                    playButton.disabled = false;
                }
            } else {
                playButton.disabled = true;
                mayhemMessage.textContent = 'Leaving queue...';
                try {
                    await fetch('/api/matchmaking/leave', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                    });
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    mayhemMessage.textContent = 'You have left the queue.';
                    mayhemMessage.className = '';
                    playButton.textContent = 'Play';
                    playButton.style.borderColor = '#00FF00';
                    playButton.disabled = false;
                } catch (error) {
                    console.error('Error leaving queue:', error);
                    mayhemMessage.textContent = 'Error: Failed to leave queue.';
                    mayhemMessage.className = 'error';
                    playButton.disabled = false;
                }
            }
        });
    };

    const checkMatchmakingStatus = async () => {
        try {
            const response = await fetch('/api/matchmaking/status', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await response.json();
            if (data.status === 'found') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                window.location.href = `/arena.html?matchId=${data.matchId}`;
            } else {
                console.log('Still waiting for a match...');
            }
        } catch (error) {
            console.error('Error polling for match status:', error);
            clearInterval(pollingInterval);
            pollingInterval = null;
            const playButton = document.getElementById('playMayhemButton');
            const mayhemMessage = document.getElementById('mayhemMessage');
            mayhemMessage.textContent = 'Error: Disconnected from queue. Please try again.';
            mayhemMessage.className = 'error';
            playButton.textContent = 'Play';
            playButton.style.borderColor = '#00FF00';
            playButton.disabled = false;
        }
    };
    
    const attachAuthFormListeners = () => {
        const loginView = document.querySelector('#loginForm')?.parentElement;
        const registerView = document.getElementById('registerView');
        const forgotPasswordView = document.getElementById('forgotPasswordView');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        const showRegister = document.getElementById('showRegister');
        const showLogin = document.getElementById('showLogin');
        const showForgotPassword = document.getElementById('showForgotPassword');
        const showLoginFromForgot = document.getElementById('showLoginFromForgot');
        const messageDiv = document.getElementById('message');

        const showView = (viewToShow) => {
            if (loginView && registerView && forgotPasswordView) {
                [loginView, registerView, forgotPasswordView].forEach(view => view.classList.add('hidden'));
                viewToShow.classList.remove('hidden');
                messageDiv.textContent = '';
                messageDiv.className = '';
            }
        };

        if (showRegister) showRegister.addEventListener('click', () => showView(registerView));
        if (showLogin) showLogin.addEventListener('click', () => showView(loginView));
        if (showForgotPassword) showForgotPassword.addEventListener('click', () => showView(forgotPasswordView));
        if (showLoginFromForgot) showLoginFromForgot.addEventListener('click', () => showView(loginView));

        if (registerForm) registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password }),
                });
                const data = await response.json();
                messageDiv.textContent = data.message;
                messageDiv.className = response.ok ? 'success' : 'error';
                if (response.ok) registerForm.reset();
            } catch (error) {
                console.error('Registration error:', error);
                messageDiv.textContent = 'Error: Failed to register. Please try again.';
                messageDiv.className = 'error';
            }
        });

        if (loginForm) loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('authToken', data.token);
                fetchAndRenderLobby();
            } else {
                messageDiv.textContent = 'Error: ' + data.message;
                messageDiv.className = 'error';
            }
        });

        if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            const response = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), });
            const data = await response.json();
            messageDiv.textContent = data.message;
            messageDiv.className = response.ok ? 'success' : 'error';
        });
    };

    fetchAndRenderLobby();
});