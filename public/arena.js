document.addEventListener('DOMContentLoaded', () => {
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const tapButton = document.getElementById('tapButton');

    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');

    if (!matchId) {
        document.querySelector('.container').innerHTML = '<h2>Error: No Match ID found.</h2>';
        return;
    }

    // Connect to the WebSocket server, now with the auth token
    const socket = io({
        auth: {
            token: localStorage.getItem('authToken')
        }
    });

    // --- EMIT EVENTS (Client to Server) ---

    // 1. Join the specific match room once connected
    socket.on('connect', () => {
        console.log('Connected to server, joining match...');
        socket.emit('joinMatch', { matchId });
    });

    // 2. Send a tap event when the button is clicked
    tapButton.addEventListener('click', () => {
        socket.emit('playerTap', { matchId });
    });


    // --- LISTEN FOR EVENTS (Server to Client) ---

    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        if (data.faction === 'BULLS') {
            factionIndicator.style.color = '#00FF00'; // Green
        } else {
            factionIndicator.style.color = '#FF0000'; // Red
        }
    });

    socket.on('priceUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
    });
    
    // Listen for connection errors (e.g., invalid token)
    socket.on('connect_error', (err) => {
        alert(err.message); // e.g., "Authentication error: Invalid token"
        window.location.href = '/'; // Redirect to login page
    });

    socket.on('error', (data) => {
        alert('An error occurred: ' + data.message);
    });
});