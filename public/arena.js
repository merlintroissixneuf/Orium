document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const arenaContent = document.getElementById('arenaContent');
    const factionIndicator = document.getElementById('factionIndicator');
    const timerDisplay = document.getElementById('timer');
    const countdownDisplay = document.getElementById('countdown');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const priceBox = document.getElementById('priceBox'); // Canvas container

    // --- Canvas Setup ---
    const canvas = document.createElement('canvas');
    canvas.id = 'priceChartCanvas';
    priceBox.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // --- Game Constants & State Variables ---
    const MAX_PRICE_SWING = 15.00; // Defines the score range from -15.00 to +15.00
    const MIN_TAP_INTERVAL = 50;   // Prevents spamming taps (50ms = 20 taps/sec max)

    let currentPrice = 0;       // The smoothly animated score value
    let targetPrice = 0;        // The latest score value from the server
    let bullTaps = 0;
    let bearTaps = 0;
    let canTap = false;         // Is the player allowed to tap? (false during countdown/end)
    let userTapCount = 0;
    let showTapIndicator = false; // Controls the "TAP TO PUSH!" animation
    let playerFaction = null;

    // --- Animation & Rate Limiting ---
    let animationFrameId = null;
    let tapIndicatorAnimationFrameId = null;
    let lastTapTime = 0;
    let lastTouchTime = 0;
    let lastRedirect = 0; // Prevents multiple rapid redirects on error

    // --- Initialization ---
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        if (Date.now() - lastRedirect > 1000) {
            window.location.href = '/';
        }
        return;
    }

    // --- Canvas & Event Listeners ---
    const resizeCanvas = () => {
        canvas.width = priceBox.offsetWidth;
        canvas.height = priceBox.offsetHeight;
        ctx.imageSmoothingEnabled = false; // For crisp pixel-art rendering
        drawArena(); // Redraw the scene whenever the canvas is resized
    };
    window.addEventListener('resize', resizeCanvas);

    const handleTap = () => {
        const now = Date.now();
        if (canTap && (now - lastTapTime >= MIN_TAP_INTERVAL)) {
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
            lastTapTime = now;
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
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
        if (canTap && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            handleTap();
        }
    });

    // --- WebSocket Connection & Event Handlers ---
    const socket = io({
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
        console.log('Socket connected. Joining match:', matchId);
        socket.emit('joinMatch', { matchId });
    });

    socket.on('matchJoined', (data) => {
        console.log('Match joined:', data);
        playerFaction = data.faction.toUpperCase();
        factionIndicator.textContent = `FACTION: ${playerFaction}`;
        currentPrice = parseFloat(data.start_price) || 0;
        targetPrice = currentPrice;

        showTapIndicator = true;
        setTimeout(() => {
            showTapIndicator = false;
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
            tapIndicatorAnimationFrameId = null;
            drawArena();
        }, 3000);

        resizeCanvas();
        if (!animationFrameId) animationFrameId = requestAnimationFrame(animateArena);
        if (!tapIndicatorAnimationFrameId) tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0;
        bullTaps = data.bullTaps || 0;
        bearTaps = data.bearTaps || 0;
        if (!animationFrameId) animationFrameId = requestAnimationFrame(animateArena);
    });

    socket.on('timeUpdate', (data) => {
        const seconds = data.remainingTime % 60;
        const minutes = Math.floor(data.remainingTime / 60);
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
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
        animationFrameId = null;
        tapIndicatorAnimationFrameId = null;
        arenaContent.removeEventListener('click', handleTap);
        document.removeEventListener('keydown', handleTap);

        const leaderboardHTML = data.leaderboard.map(player =>
            `<div class="leaderboard-entry"><span class="leaderboard-username">${player.username}</span><span class="leaderboard-taps">${player.tap_count} taps</span></div>`
        ).join('');

        arenaContent.innerHTML = `
            <div class="match-over-screen">
                <h2>GAME OVER</h2>
                <h3>${data.winningFaction.toUpperCase()} WIN!</h3>
                <div class="leaderboard">
                    <h3>Leaderboard</h3>
                    ${leaderboardHTML}
                </div>
                <button id="lobbyReturnButton">Return to Lobby</button>
            </div>
        `;
        // Recolor winning faction text after injecting HTML
        const winnerText = arenaContent.querySelector('.match-over-screen h3');
        if (winnerText) {
            winnerText.style.color = data.winningFaction === 'BULLS' ? '#00FF00' : '#FF0000';
        }

        document.getElementById('lobbyReturnButton').addEventListener('click', () => {
            window.location.href = '/';
        });
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
        if (Date.now() - lastRedirect > 1000) {
            window.location.href = '/';
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    });

    // --- Rendering & Animation ---
    function drawArena() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        const candleWidth = canvas.width * 0.4;
        const candleHeight = canvas.height * 0.85;
        const candleX = (canvas.width - candleWidth) / 2;
        const candleY = (canvas.height - candleHeight) / 2;
        const borderWidth = 4;

        const clampedPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, currentPrice));
        
        const priceToCandleY = (price) => {
            const innerHeight = candleHeight - (borderWidth * 2);
            const normalizedPrice = (price + MAX_PRICE_SWING) / (2 * MAX_PRICE_SWING);
            return (candleY + borderWidth) + innerHeight * (1 - normalizedPrice);
        };

        const clashY = priceToCandleY(clampedPrice);
        const innerX = candleX + borderWidth;
        const innerWidth = candleWidth - (borderWidth * 2);

        ctx.fillStyle = '#00FF00';
        const greenFillY = clashY;
        const greenFillHeight = (candleY + candleHeight - borderWidth) - clashY;
        ctx.fillRect(innerX, greenFillY, innerWidth, greenFillHeight);

        ctx.fillStyle = '#FF0000';
        const redFillY = candleY + borderWidth;
        const redFillHeight = clashY - redFillY;
        ctx.fillRect(innerX, redFillY, innerWidth, redFillHeight);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(candleX, candleY, candleWidth, candleHeight);
        
        ctx.font = '12px "Press Start 2P"';
        ctx.textAlign = 'center';
        
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'bottom';
        ctx.fillText(clampedPrice.toFixed(2), candleX + candleWidth / 2, clashY - 5);

        ctx.textBaseline = 'top';
        ctx.fillStyle = '#FF0000';
        ctx.fillText(`BEARS: ${bearTaps}`, candleX + candleWidth / 2, candleY + 10);
        
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#00FF00';
        ctx.fillText(`BULLS: ${bullTaps}`, candleX + candleWidth / 2, candleY + candleHeight - 10);
    }

    function animateArena() {
        const easingFactor = 0.15;
        currentPrice += (targetPrice - currentPrice) * easingFactor;

        if (Math.abs(targetPrice - currentPrice) < 0.01) {
            currentPrice = targetPrice;
            drawArena();
            animationFrameId = null;
            return;
        }

        drawArena();
        animationFrameId = requestAnimationFrame(animateArena);
    }

    function animateTapIndicator() {
        if (!showTapIndicator) {
             if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
             tapIndicatorAnimationFrameId = null;
             drawArena();
             return;
        }

        drawArena();

        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP TO PUSH!', canvas.width / 2, canvas.height / 2);

        tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    }
});