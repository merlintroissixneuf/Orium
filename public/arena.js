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
    const arenaContent = document.getElementById('arenaContent');

    // State
    let startPrice = 0;
    
    // Connection
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        arenaContent.innerHTML = '<h2>Error: Missing match or auth data.</h2>';
        return;
    }

    const socket = io({ auth: { token } });

    socket.on('connect', () => socket.emit('joinMatch', { matchId }));

    tapButton.addEventListener('click', () => socket.emit('playerTap', { matchId }) );

    // Event Listeners
    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        startPrice = parseFloat(data.start_price);
    });
    
    socket.on('gameStateUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;

        const priceChange = data.newPrice - startPrice;
        // Let's say a full bar represents a +/- 25 point swing
        const maxPriceSwing = 25; 
        const fillPercentage = (priceChange / maxPriceSwing) * 50;
        
        // Clamp the values between -50 and 50
        const clampedFill = Math.max(-50, Math.min(50, fillPercentage));

        bullsFill.style.height = `${50 + clampedFill}%`;
        bearsFill.style.height = `${50 - clampedFill}%`;
    });

    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    socket.on('matchEnd', (data) => {
        arenaContent.innerHTML = `
            <div class="match-over-screen">
                <h2>GAME OVER</h2>
                <h3 style="color: ${data.winningFaction === 'BULLS' ? '#00FF00' : '#FF0000'};">${data.winningFaction} WIN!</h3>
                <button id="lobbyReturnButton">Return to Lobby</button>
            </div>
        `;
        document.getElementById('lobbyReturnButton').addEventListener('click', () => {
            window.location.href = '/';
        });
    });

    socket.on('connect_error', (err) => { window.location.href = '/'; });
    socket.on('error', (data) => { alert('An error occurred: ' + data.message); });
});