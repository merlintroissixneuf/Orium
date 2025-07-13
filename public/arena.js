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
        // If critical info is missing, redirect to home page.
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
        e.preventDefault(); // Prevent click event from firing as well
        const now = Date.now();
        if (now - lastTouchTime >= MIN_TAP_INTERVAL) {
            handleTap();
            lastTouchTime = now;
        }
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
        // Allow tapping with spacebar or enter key
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

        // Show "TAP!" indicator for the first 3 seconds
        showTapIndicator = true;
        setTimeout(() => {
            showTapIndicator = false;
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
            tapIndicatorAnimationFrameId = null;
            drawArena(); // Redraw to clear the text
        }, 3000);

        resizeCanvas(); // Set initial canvas size and draw the scene
        if (!animationFrameId) animationFrameId = requestAnimationFrame(animateArena);
        if (!tapIndicatorAnimationFrameId) tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0;
        bullTaps = data.bullTaps || 0;
        bearTaps = data.bearTaps || 0;
        // Start the animation loop if it's not already running
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
            canTap = true; // Allow tapping now that the match has started
        }
    });

    socket.on('matchEnd', (data) => {
        console.log('Match ended:', data);
        canTap = false;
        // Stop all animations and remove event listeners
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
        animationFrameId = null;
        tapIndicatorAnimationFrameId = null;
        arenaContent.removeEventListener('click', handleTap);
        document.removeEventListener('keydown', handleTap);

        const leaderboardHTML = data.leaderboard.map(player =>
            `<div class="leaderboard-entry"><span class="leaderboard-username">${player.username}</span>: <span class="leaderboard-taps">${player.tap_count} taps</span></div>`
        ).join('');

        arenaContent.innerHTML = `
            <div class="match-over-screen">
                <h2>GAME OVER</h2>
                <h3 style="color: ${data.winningFaction === 'BULLS' ? '#00FF00' : '#FF0000'};">${data.winningFaction.toUpperCase()} WIN!</h3>
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

    /**
     * The main drawing function. Renders the battle candle and all text on the canvas.
     */
    function drawArena() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        // Define candle geometry
        const candleWidth = canvas.width * 0.4;
        const candleHeight = canvas.height * 0.85;
        const candleX = (canvas.width - candleWidth) / 2;
        const candleY = (canvas.height - candleHeight) / 2;
        const borderWidth = 4; // Pixel border width

        // --- Calculate Fill Levels ---
        const clampedPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, currentPrice));
        
        // This helper function maps a score value [-15, 15] to a Y coordinate within the candle's inner area.
        const priceToCandleY = (price) => {
            const innerHeight = candleHeight - (borderWidth * 2);
            const normalizedPrice = (price + MAX_PRICE_SWING) / (2 * MAX_PRICE_SWING); // Converts score to a 0-1 range
            // Invert the range because canvas Y is 0 at the top
            return (candleY + borderWidth) + innerHeight * (1 - normalizedPrice);
        };

        const clashY = priceToCandleY(clampedPrice);
        const innerX = candleX + borderWidth;
        const innerWidth = candleWidth - (borderWidth * 2);

        // --- Draw Fills (inside the border) ---
        // Draw Bullish (Green) Fill from the bottom of the candle up to the clash point
        ctx.fillStyle = '#00FF00';
        const greenFillY = clashY;
        const greenFillHeight = (candleY + candleHeight - borderWidth) - clashY;
        ctx.fillRect(innerX, greenFillY, innerWidth, greenFillHeight);

        // Draw Bearish (Red) Fill from the top of the candle down to the clash point
        ctx.fillStyle = '#FF0000';
        const redFillY = candleY + borderWidth;
        const redFillHeight = clashY - redFillY;
        ctx.fillRect(innerX, redFillY, innerWidth, redFillHeight);
        
        // --- Draw the Candle Outline (on top of the fills) ---
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(candleX, candleY, candleWidth, candleHeight);
        
        // --- Draw Text Elements Directly on Canvas ---
        ctx.font = '12px "Press Start 2P"';
        ctx.textAlign = 'center';
        
        // Draw current score value near the clash point
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'bottom';
        ctx.fillText(clampedPrice.toFixed(2), candleX + candleWidth / 2, clashY - 5);

        // Draw Faction Tap Counts at the top and bottom of the candle
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#FF0000';
        ctx.fillText(`BEARS: ${bearTaps}`, candleX + candleWidth / 2, candleY + 10);
        
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#00FF00';
        ctx.fillText(`BULLS: ${bullTaps}`, candleX + candleWidth / 2, candleY + candleHeight - 10);
    }

    /**
     * Smoothly animates the score and redraws the scene each frame.
     */
    function animateArena() {
        const easingFactor = 0.15; // Controls how quickly the score "catches up" to the server value
        currentPrice += (targetPrice - currentPrice) * easingFactor;

        // If the animation is close enough to the target, snap to it and stop the loop.
        if (Math.abs(targetPrice - currentPrice) < 0.01) {
            currentPrice = targetPrice;
            drawArena(); // Final draw
            animationFrameId = null; // Stop the animation loop
            return;
        }

        drawArena(); // Redraw the scene
        animationFrameId = requestAnimationFrame(animateArena); // Continue the loop
    }

    /**
     * Animates the "TAP TO PUSH!" text with a pulsating effect.
     */
    function animateTapIndicator() {
        if (!showTapIndicator) {
             if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
             tapIndicatorAnimationFrameId = null;
             drawArena(); // Redraw to ensure the text is gone
             return;
        }

        drawArena(); // Draw the base arena first

        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150); // Pulsating effect
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP TO PUSH!', canvas.width / 2, canvas.height / 2);

        tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    }
});