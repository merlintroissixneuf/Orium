// public/app.js
document.addEventListener('DOMContentLoaded', () => {
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
            view.classList.add('hidden');
        });
        viewToShow.classList.remove('hidden');
        messageDiv.textContent = '';
        messageDiv.className = '';
    }

    // View Toggling Listeners
    showRegister.addEventListener('click', () => showView(registerView));
    showLogin.addEventListener('click', () => showView(loginView));
    showForgotPassword.addEventListener('click', () => showView(forgotPasswordView));
    showLoginFromForgot.addEventListener('click', () => showView(loginVew));

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
        
        // This message now includes the "(and spam folder)" text
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
            document.querySelector('.container').innerHTML = `<h2>Welcome!</h2><p>You are logged in.</p>`;
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
});