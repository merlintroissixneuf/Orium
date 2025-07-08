// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const messageDiv = document.getElementById('message');

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent page reload

        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        messageDiv.textContent = '';
        messageDiv.className = '';

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                messageDiv.textContent = 'Success! ' + data.message;
                messageDiv.classList.add('success');
                registerForm.reset();
            } else {
                messageDiv.textContent = 'Error: ' + data.message;
                messageDiv.classList.add('error');
            }
        } catch (error) {
            messageDiv.textContent = 'A network error occurred.';
            messageDiv.classList.add('error');
        }
    });
});