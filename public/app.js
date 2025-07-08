// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.querySelector('.container');

    // Check if a user is already logged in (token exists in localStorage)
    const token = localStorage.getItem('authToken');
    if (token) {
        showLobby();
    }

    function showLobby() {
        mainContainer.innerHTML = `
            <h2>Game Lobby</h2>
            <p>Ready to play?</p>
            <button id="playButton">Play Meme Stock Mayhem</button>
            <div id="lobbyMessage" style="margin-top: 1rem; text-align: center;"></div>
        `;

        document.getElementById('playButton').addEventListener('click', async () => {
            const lobbyMessage = document.getElementById('lobbyMessage');
            lobbyMessage.textContent = 'Finding a match...';
            lobbyMessage.className = 'success';

            try {
                const response = await fetch('/api/matchmaking/join', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    }
                });
                const data = await response.json();
                if(response.ok) {
                    lobbyMessage.textContent = data.message;
                } else {
                    lobbyMessage.textContent = 'Error: ' + data.message;
                    lobbyMessage.className = 'error';
                }
            } catch (error) {
                lobbyMessage.textContent = 'Network error.';
                lobbyMessage.className = 'error';
            }
        });
    }


    // --- All the existing login/register form logic below ---
    
    // Check if we are on the main page with the forms
    if (document.getElementById('loginView')) {
        // Views
        const loginView = document.getElementById('loginView');
        const registerView = document.getElementById('registerView');
        const forgotPasswordView = document.getElementById('forgotPasswordView');

        // Forms
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        
        // Links
        const showRegister = document.getElementById('showRegister');
        const showLogin = document.getElementById('showLogin');
        const showForgotPassword = document.getElementById('showForgotPassword');
        const showLoginFromForgot = document.getElementById('showLoginFromForgot');

        // Message Div
        const messageDiv = document.getElementById('message');

        function showView(viewToShow) {
            [loginView, registerView, forgotPasswordView].forEach(view => {
                if(view) view.classList.add('hidden');
            });
            viewToShow.classList.remove('hidden');
            messageDiv.textContent = '';
            messageDiv.className = '';
        }

        // View Toggling Listeners
        showRegister.addEventListener('click', () => showView(registerView));
        showLogin.addEventListener('click', () => showView(loginView));
        showForgotPassword.addEventListener('click', () => showView(forgotPasswordView));
        showLoginFromForgot.addEventListener('click', () => showView(loginView));

        // Register Form Submission
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

        // Login Form Submission
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
                showLobby();
            } else {
                messageDiv.textContent = 'Error: ' + data.message;
                messageDiv.className = 'error';
            }
        });

        // Forgot Password Form Submission
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
    }
});