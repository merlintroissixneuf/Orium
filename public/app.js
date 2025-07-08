document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.querySelector('.container');

    const fetchAndRenderLobby = async () => {
        // This line was moved inside the function to get the latest token status
        const token = localStorage.getItem('authToken'); 
        
        if (!token) {
            renderLoginView(); // If no token, show login
            return;
        }

        try {
            const response = await fetch('/api/user/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                renderLobbyView(userData);
            } else {
                // Token is invalid or expired
                localStorage.removeItem('authToken');
                renderLoginView();
            }
        } catch (error) {
            console.error('Failed to fetch user data:', error);
            renderLoginView(); // Show login on error
        }
    };
    
    const renderLobbyView = (userData) => {
        mainContainer.innerHTML = `
            <div class="lobby-header">
                <div class="profile-name">${userData.username}</div>
                <div class="wallet">
                    <div>HT: ${Number(userData.hype_token_balance).toLocaleString()}</div>
                    <div>OS: ${Number(userData.orium_shard_balance).toLocaleString()}</div>
                </div>
            </div>
            <div class="game-modes">
                <div class="game-tile">
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

        document.getElementById('playMayhemButton').addEventListener('click', async () => {
            const mayhemMessage = document.getElementById('mayhemMessage');
            mayhemMessage.textContent = 'Finding a match...';
            mayhemMessage.className = 'success';

            const response = await fetch('/api/matchmaking/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            const data = await response.json();
            if(response.ok) {
                mayhemMessage.textContent = data.message;
            } else {
                mayhemMessage.textContent = 'Error: ' + data.message;
                mayhemMessage.className = 'error';
            }
        });
    };
    
    const renderLoginView = () => {
        mainContainer.innerHTML = `
            <div id="loginView">
                <h2>Login</h2>
                <form id="loginForm">
                    <input type="email" id="loginEmail" placeholder="Email" required>
                    <input type="password" id="loginPassword" placeholder="Password" required>
                    <button type="submit">Login</button>
                </form>
                <div class="toggle-link"><a id="showForgotPassword">Forgot Password?</a></div>
                <div class="toggle-link">Don't have an account? <a id="showRegister">Register here</a></div>
            </div>
            <div id="registerView" class="hidden">
                <h2>Register</h2>
                <form id="registerForm">
                    <input type="text" id="registerUsername" placeholder="Username" required>
                    <input type="email" id="registerEmail" placeholder="Email" required>
                    <input type="password" id="registerPassword" placeholder="Password" required>
                    <button type="submit">Create Account</button>
                </form>
                <div class="toggle-link">Already have an account? <a id="showLogin">Login here</a></div>
            </div>
            <div id="forgotPasswordView" class="hidden">
                <h2>Forgot Password</h2>
                <form id="forgotPasswordForm">
                    <p style="font-size: 0.8em; text-align: center; margin-top: 0;">Enter your email and we'll send you a reset link.</p>
                    <input type="email" id="forgotEmail" placeholder="Email" required>
                    <button type="submit">Send Reset Link</button>
                </form>
                <div class="toggle-link">Remembered your password? <a id="showLoginFromForgot">Login here</a></div>
            </div>
            <div id="message"></div>
        `;
        attachAuthFormListeners();
    };

    const attachAuthFormListeners = () => {
        const loginView = document.getElementById('loginView');
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
            [loginView, registerView, forgotPasswordView].forEach(view => view.classList.add('hidden'));
            viewToShow.classList.remove('hidden');
            messageDiv.textContent = '';
            messageDiv.className = '';
        };

        showRegister.addEventListener('click', () => showView(registerView));
        showLogin.addEventListener('click', () => showView(loginView));
        showForgotPassword.addEventListener('click', () => showView(forgotPasswordView));
        showLoginFromForgot.addEventListener('click', () => showView(loginView));

        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });
            const data = await response.json();
            messageDiv.textContent = data.message;
            messageDiv.className = response.ok ? 'success' : 'error';
            if (response.ok) registerForm.reset();
        });

        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('authToken', data.token);
                fetchAndRenderLobby();
            } else {
                messageDiv.textContent = 'Error: ' + data.message;
                messageDiv.className = 'error';
            }
        });

        forgotPasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            const response = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await response.json();
            messageDiv.textContent = data.message;
            messageDiv.className = response.ok ? 'success' : 'error';
        });
    };

    // Initial page load check
    fetchAndRenderLobby();
});