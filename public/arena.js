document.addEventListener('DOMContentLoaded', () => {
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const tapButton = document.getElementById('tapButton');

    // Get matchId from the URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');

    if (!matchId) {
        document.querySelector('.container').innerHTML = '<h2>Error: No Match ID found.</h2>';
        return;
    }

    // Connect to the WebSocket server
    const socket = io();

    // --- EMIT EVENTS (Client to Server) ---

    // 1. Join the specific match room
    socket.emit('joinMatch', { matchId });

    // 2. Send a tap event when the button is clicked
    tapButton.addEventListener('click', () => {
        socket.emit('playerTap', { matchId });
    });


    // --- LISTEN FOR EVENTS (Server to Client) ---

    // 1. Listen for confirmation you've joined a faction
    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        if (data.faction === 'BULLS') {
            factionIndicator.style.color = '#00FF00'; // Green
        } else {
            factionIndicator.style.color = '#FF0000'; // Red
        }
    });

    // 2. Listen for price updates
    socket.on('priceUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
    });

    // 3. Listen for errors
    socket.on('error', (data) => {
        alert('An error occurred: ' + data.message);
    });
});