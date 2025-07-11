document.addEventListener('DOMContentLoaded', () => {
    const tapArea = document.getElementById('tapArea');
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const timerDisplay = document.getElementById('timer');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const bullsFill = document.getElementById('bullsFill');
    const bearsFill = document.getElementById('bearsFill');
    const arenaContent = document.getElementById('arenaContent');
    const bullsText = document.getElementById('bullsText');
    const bearsText = document.getElementById('bearsText');

    let startPrice = 0;
    let canTap = true;
    let userTapCount = 0;

    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        window.location.href = '/';
        return;
    }

    const socket = io({ auth: { token }, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

    const handleTap = () => {
        if (canTap) {
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
        }
    };
    
    tapArea.addEventListener('click', handleTap);

    socket.on('connect', () => socket.emit('joinMatch', { matchId }) );

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

        const bullTaps = data.bullTaps || 0;
        const bearTaps = data.bearTaps || 0;
        const maxTaps = Math.max(bullTaps, bearTaps, 1);
        const minFontSize = 0.5;
        const maxFontSize = 2.0;
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
        bullsText.style.display = 'none';
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
    socket.on('disconnect', () => {
        canTap = false;
        alert('Disconnected. Reconnecting...');
    });
    socket.on('reconnect', () => {
        canTap = true;
        socket.emit('joinMatch', { matchId });
    });
});