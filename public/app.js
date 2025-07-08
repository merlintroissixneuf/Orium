document.addEventListener('DOMContentLoaded', () => {
    // Views
    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');

    // Forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    // Links
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');

    // Message Div
    const messageDiv = document.getElementById('message');

    // View Toggling
    showRegister.addEventListener('click', () => {
        loginView.classList.add('hidden');
        registerView.classList.remove('hidden');
        messageDiv.textContent = '';
    });

    showLogin.addEventListener('click', () => {
        registerView.classList.add('hidden');
        loginView.classList.remove('hidden');
        messageDiv.textContent = '';
    });

    // Register Form Submission
    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        
        messageDiv.textContent = '';
        messageDiv.className = '';

        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        });
        const data = await response.json();
        
        if (response.ok) {
            messageDiv.textContent = data.message;
            messageDiv.className = 'success';
            registerForm.reset();
        } else {
            messageDiv.textContent = 'Error: ' + data.message;
            messageDiv.className = 'error';
        }
    });

    // Login Form Submission
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        messageDiv.textContent = '';
        messageDiv.className = '';

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
});