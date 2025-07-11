document.addEventListener('DOMContentLoaded', () => {
    const tapArea = document.getElementById('tapArea');
    const factionIndicator = document.getElementById('factionIndicator');
    const timerDisplay = document.getElementById('timer');
    const countdownDisplay = document.getElementById('countdown');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const arenaContent = document.getElementById('arenaContent');
    const candleCanvas = document.getElementById('candleChart');
    const candleCtx = candleCanvas.getContext('2d');
    const MAX_PRICE_SWING = 15.00; // Added to match server

    let startPrice = 0;
    let currentPrice = 0;
    let canTap = false;
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
    tapArea.addEventListener('touchstart', handleTap);

    socket.on('connect', () => socket.emit('joinMatch', { matchId }) );

    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        startPrice = parseFloat(data.start_price);
        currentPrice = startPrice;
        drawCandle();
        startCountdown();
    });
    
    socket.on('gameStateUpdate', (data) => {
        currentPrice = data.newPrice;
        drawCandle();
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
    });

    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    socket.on('matchEnd', (data) => {
        tapArea.removeEventListener('click', handleTap);
        tapArea.removeEventListener('touchstart', handleTap);
        canTap = false;
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

    function startCountdown() {
        let countdown = 5;
        countdownDisplay.textContent = `Starting in ${countdown}`;
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownDisplay.textContent = `Starting in ${countdown}`;
            } else {
                countdownDisplay.textContent = '';
                canTap = true;
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    function drawCandle() {
        const width = candleCanvas.width;
        const height = candleCanvas.height;
        candleCtx.clearRect(0, 0, width, height);

        const midY = height / 2;
        const scale = height / (2 * MAX_PRICE_SWING);
        const bodyHeight = Math.abs(currentPrice - startPrice) * scale;
        const wickHeight = 10; // Fixed wick size

        candleCtx.lineWidth = 2;
        candleCtx.strokeStyle = currentPrice > startPrice ? '#00FF00' : '#FF0000';
        candleCtx.fillStyle = currentPrice > startPrice ? '#00FF00' : '#FF0000';

        // Draw wick
        const wickTop = midY - (Math.max(currentPrice, startPrice) * scale) - wickHeight / 2;
        const wickBottom = midY - (Math.min(currentPrice, startPrice) * scale) + wickHeight / 2 + bodyHeight;
        candleCtx.beginPath();
        candleCtx.moveTo(width / 2, wickTop);
        candleCtx.lineTo(width / 2, wickBottom + bodyHeight);
        candleCtx.stroke();

        // Draw body
        const bodyTop = midY - Math.max(currentPrice, startPrice) * scale;
        candleCtx.fillRect(width / 4, bodyTop, width / 2, bodyHeight);
    }
});