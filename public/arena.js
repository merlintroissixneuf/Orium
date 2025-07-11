document.addEventListener('DOMContentLoaded', () => {
    const arenaContent = document.getElementById('arenaContent');
    const factionIndicator = document.getElementById('factionIndicator');
    const timerDisplay = document.getElementById('timer');
    const countdownDisplay = document.getElementById('countdown');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const candleCanvas = document.getElementById('candleChart');
    const candleCtx = candleCanvas.getContext('2d');
    const MAX_PRICE_SWING = 15.00;

    let startPrice = 0;
    let currentPrice = 0;
    let canTap = false;
    let userTapCount = 0;

    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        console.log('Missing matchId or authToken, redirecting to lobby');
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
    
    arenaContent.addEventListener('click', handleTap);
    arenaContent.addEventListener('touchstart', handleTap);
    document.addEventListener('keydown', (e) => {
        if (canTap && (e.key === ' ' || e.key === 'Enter')) {
            handleTap();
        }
    });

    socket.on('connect', () => {
        console.log('Socket connected, joining match:', matchId);
        socket.emit('joinMatch', { matchId });
    });

    socket.on('matchJoined', (data) => {
        console.log('Match joined:', data);
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

    socket.on('countdown', (data) => {
        countdownDisplay.textContent = `Starting in ${data.countdown}`;
        if (data.countdown <= 0) {
            countdownDisplay.textContent = '';
            canTap = true;
        }
    });

    socket.on('matchEnd', (data) => {
        console.log('Match ended:', data);
        arenaContent.removeEventListener('click', handleTap);
        arenaContent.removeEventListener('touchstart', handleTap);
        document.removeEventListener('keydown', handleTap);
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

    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        window.location.href = '/';
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data.message);
        alert('An error occurred: ' + data.message);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        canTap = false;
        alert('Disconnected. Reconnecting...');
    });

    socket.on('reconnect', () => {
        console.log('Socket reconnected');
        canTap = true;
        socket.emit('joinMatch', { matchId });
    });

    function startCountdown() {
        // Handled by server-side countdown event
    }

    function drawCandle() {
        const width = candleCanvas.width;
        const height = candleCanvas.height;
        candleCtx.clearRect(0, 0, width, height);

        // Set pixelated rendering
        candleCtx.imageSmoothingEnabled = false;

        const midY = height / 2;
        const scale = height / (2 * MAX_PRICE_SWING);
        const bodyHeight = Math.abs(currentPrice - startPrice) * scale;
        const wickHeight = 10;

        // Draw price markers
        candleCtx.fillStyle = '#FFFFFF';
        candleCtx.font = '8px "Press Start 2P"';
        for (let price = -MAX_PRICE_SWING; price <= MAX_PRICE_SWING; price += 5) {
            const y = midY - price * scale;
            candleCtx.fillText(`${price.toFixed(0)}`, 10, y + 3);
        }

        // Set candle colors
        const isBullish = currentPrice > startPrice;
        candleCtx.fillStyle = isBullish ? '#00FF00' : '#FF0000';
        candleCtx.strokeStyle = '#FFFFFF';
        candleCtx.lineWidth = 4;

        // Draw wick
        const wickTop = midY - (Math.max(currentPrice, startPrice) * scale) - wickHeight / 2;
        const wickBottom = midY - (Math.min(currentPrice, startPrice) * scale) + wickHeight / 2 + bodyHeight;
        candleCtx.beginPath();
        candleCtx.moveTo(width / 2, wickTop);
        candleCtx.lineTo(width / 2, wickBottom);
        candleCtx.stroke();

        // Draw body (pixelated block)
        const bodyTop = midY - Math.max(currentPrice, startPrice) * scale;
        const bodyWidth = width / 4;
        candleCtx.fillRect(width / 2 - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    }
});