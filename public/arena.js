document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const tapArea = document.getElementById('tapArea');
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const timerDisplay = document.getElementById('timer');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const bullsFill = document.getElementById('bullsFill');
    const bearsFill = document.getElementById('bearsFill');
    const arenaContent = document.getElementById('arenaContent');
    const bullsText = document.getElementById('bullsText');
    const bearsText = document.getElementById('bearsText');

    // State
    let startPrice = 0;
    let canTap = true;

    // Connection
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        arenaContent.innerHTML = '<h2>Error: Missing match or auth data.</h2>';
        return;
    }

    const socket = io({ auth: { token } });

    // --- Tap Handling ---
    const handleTap = () => {
        if (canTap) {
            socket.emit('playerTap', { matchId });
            canTap = false;
            setTimeout(() => { canTap = true; }, 100);
        }
    };
    
    tapArea.addEventListener('click', handleTap);

    // --- Socket Event Listeners ---
    socket.on('connect', () => socket.emit('joinMatch', { matchId}) );

    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        startPrice = parseFloat(data.start_price);
    });
    
    socket.on('gameStateUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;

        const priceChange = data.newPrice - startPrice;
        const maxPriceSwing = 15;
        const fillPercentage = (priceChange / maxPriceSwing) * 50;
        const clampedFill = Math.max(-50, Math.min(50, fillPercentage));

        bullsFill.style.height = `${50 + clampedFill}%`;
        bearsFill.style.height = `${50 - clampedFill}%`;

        // Dynamic text size based on tap counts
        const bullTaps = data.bullTaps || 0;
        const bearTaps = data.bearTaps || 0;
        const maxTaps = Math.max(bullTaps, bearTaps, 1); // Avoid division by zero
        const minFontSize = 0.5; // em
        const maxFontSize = 2.0; // em
        const bullFontSize = bullTaps > bearTaps 
            ? minFontSize + (maxFontSize - minFontSize) * (bullTaps / maxTaps)
            : minFontSize + (maxFontSize - minFontSize) * (bearTaps > 0 ? bullTaps / bearTaps : 0);
        const bearFontSize = bearTaps > bullTaps 
            ? minFontSize + (maxFontSize - minFontSize) * (bearTaps / maxTaps)
            : minFontSize + (maxFontSize - minFontSize) * (bullTaps > 0 ? bearTaps / bullTaps : 0);
        bullsText.style.fontSize = `${bullFontSize}em`;
        bearsText.style.fontSize = `${bearFontSize}em`;
    });

    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    socket.on('matchEnd', (data) => {
        tapArea.removeEventListener('click', handleTap);
        canTap = false;
        bullsText.style.display = 'none'; // Hide text on match end
        bearsText.style.display = 'none';
        const leaderboardHTML = data.leaderboard.map(player => 
            `<div class="leaderboard-entry">${player.username}: ${player.tap_count} taps</div>`
        ).join('');
        arenaContent.innerHTML = `
            <div class="match-over-screen">
                <h2>GAME OVER</h2>
                <h3 style="color: ${data.winningFaction === 'BULLS' ? '#00FF00' : '#FF0000'};">${data.winningFaction} WIN!</h3>
                <div class="leaderboard">
                    <h3>Leaderboard</h3>
                    ${leaderboardHTML}
                </div>
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