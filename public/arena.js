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
    const MIN_TAP_INTERVAL = 50;

    let startPrice = 0;
    let currentPrice = 0;
    let targetPrice = 0;
    let canTap = false;
    let userTapCount = 0;
    let showTapIndicator = false;
    let lastRedirect = 0;
    let animationFrameId = null;
    let lastTapTime = 0;
    let oscillation = 0;
    let lastTouchTime = 0;

    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    const now = Date.now();
    if (!matchId || !token) {
        if (now - lastRedirect > 1000) {
            lastRedirect = now;
            console.log('Missing matchId or authToken, redirecting to lobby');
            window.location.href = '/';
        }
        return;
    }

    const socket = io({ auth: { token }, reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

    const handleTap = () => {
        if (canTap) {
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
            lastTapTime = Date.now();
            oscillation = 2;
        }
    };

    arenaContent.addEventListener('click', handleTap);
    arenaContent.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const now = Date.now();
        if (now - lastTouchTime >= MIN_TAP_INTERVAL) {
            handleTap();
            lastTouchTime = now;
        }
    });
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
        startPrice = parseFloat(data.start_price) || 0;
        currentPrice = startPrice;
        targetPrice = startPrice;
        showTapIndicator = true;
        setTimeout(() => {
            showTapIndicator = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            drawCandle(); // Redraw to ensure indicator is gone
        }, 3000);
        drawCandle();
        if (showTapIndicator) animationFrameId = requestAnimationFrame(animateTapIndicator);
        startCountdown();
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0;
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
        if (!animationFrameId) animationFrameId = requestAnimationFrame(animateCandle);
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
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
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
        if (now - lastRedirect > 1000) {
            lastRedirect = now;
            window.location.href = '/';
        }
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data.message);
        alert('An error occurred: ' + data.message);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
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
        candleCtx.imageSmoothingEnabled = false;

        const midY = height / 2;
        const scale = height / (2 * MAX_PRICE_SWING);
        const bodyHeight = Math.max(Math.abs(currentPrice - startPrice) * scale, 2);
        const wickHeight = 6;
        const isBullish = currentPrice >= startPrice;
        const priceDiff = Math.abs(currentPrice - startPrice);
        const fillPercentage = Math.min(priceDiff / MAX_PRICE_SWING, 1);

        // Draw price markers
        candleCtx.fillStyle = '#FFFFFF';
        candleCtx.font = '8px "Press Start 2P"';
        for (let price = -MAX_PRICE_SWING; price <= MAX_PRICE_SWING; price += 5) {
            const y = midY - price * scale;
            candleCtx.fillText(`${price.toFixed(0)}`, 10, y + 3);
        }

        // Apply vertical oscillation
        const yOffset = oscillation > 0 ? Math.sin(Date.now() / 50) * oscillation : 0;
        oscillation *= 0.9;
        if (oscillation < 0.1) oscillation = 0;

        // Draw wick
        candleCtx.strokeStyle = '#FFFFFF';
        candleCtx.lineWidth = 1;
        const wickTop = midY - Math.max(currentPrice, startPrice) * scale - wickHeight / 2 + yOffset;
        const wickBottom = midY - Math.min(currentPrice, startPrice) * scale + wickHeight / 2 + yOffset;
        candleCtx.beginPath();
        candleCtx.moveTo(width / 2, wickTop);
        candleCtx.lineTo(width / 2, wickBottom);
        candleCtx.stroke();

        // Draw body outline
        candleCtx.strokeStyle = '#FFFFFF';
        candleCtx.lineWidth = 1;
        const bodyTop = midY - Math.max(currentPrice, startPrice) * scale + yOffset;
        const bodyWidth = width / 12;
        candleCtx.strokeRect(width / 2 - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);

        // Draw progressive fill
        if (fillPercentage > 0) {
            candleCtx.fillStyle = isBullish ? '#00FF00' : '#FF0000';
            const fillHeight = bodyHeight * fillPercentage;
            const fillTop = isBullish ? bodyTop + (bodyHeight - fillHeight) : bodyTop;
            candleCtx.fillRect(width / 2 - bodyWidth / 2, fillTop, bodyWidth, fillHeight);
        }
    }

    function animateCandle() {
        const lerpFactor = 0.1;
        currentPrice += (targetPrice - currentPrice) * lerpFactor;
        if (Math.abs(currentPrice - targetPrice) < 0.01) currentPrice = targetPrice;
        drawCandle();
        if (Math.abs(currentPrice - targetPrice) > 0.01 || oscillation > 0) {
            animationFrameId = requestAnimationFrame(animateCandle);
        } else {
            animationFrameId = null;
        }
    }

    function animateTapIndicator() {
        if (!showTapIndicator) {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            drawCandle();
            return;
        }
        drawCandle();
        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150);
        candleCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        candleCtx.font = '10px "Press Start 2P"';
        candleCtx.textAlign = 'center';
        candleCtx.fillText('Tap to Push!', candleCanvas.width / 2, candleCanvas.height - 15);
        animationFrameId = requestAnimationFrame(animateTapIndicator);
    }
});