document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const tapButton = document.getElementById('tapButton');
    const timerDisplay = document.getElementById('timer');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const bullsFill = document.getElementById('bullsFill');
    const bearsFill = document.getElementById('bearsFill');

    // State
    let startPrice = 150; // Default, will be updated by server
    
    // Connection
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        document.querySelector('.container').innerHTML = '<h2>Error: Missing match or auth data.</h2>';
        return;
    }

    const socket = io({ auth: { token } });

    socket.on('connect', () => {
        socket.emit('joinMatch', { matchId });
    });

    tapButton.addEventListener('click', () => socket.emit('playerTap', { matchId }) );

    // Event Listeners
    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        startPrice = parseFloat(data.startPrice);
    });
    
    socket.on('gameStateUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;

        const priceChange = data.newPrice - startPrice;
        // Calculate fill percentage based on a +/- $5 range for a full bar
        const maxChange = 5; 
        const fillPercentage = (priceChange / maxChange) * 50;

        bullsFill.style.height = `${50 + fillPercentage}%`;
        bearsFill.style.height = `${50 - fillPercentage}%`;
    });

    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    socket.on('matchEnd', (data) => {
        tapButton.disabled = true;
        tapButton.textContent = 'GAME OVER';
    });

    socket.on('connect_error', (err) => { window.location.href = '/'; });
    socket.on('error', (data) => { alert('An error occurred: ' + data.message); });
});