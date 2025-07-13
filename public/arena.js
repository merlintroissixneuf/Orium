// arena.js
document.addEventListener('DOMContentLoaded', () => {
    const arenaContent = document.getElementById('arenaContent');
    const factionIndicator = document.getElementById('factionIndicator');
    const timerDisplay = document.getElementById('timer');
    const countdownDisplay = document.getElementById('countdown');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const priceBox = document.getElementById('priceBox'); // This is the canvas container

    // Create and append the canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'priceChartCanvas';
    priceBox.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const MAX_PRICE_SWING = 15.00; // Max deviation from 0.00
    const MIN_TAP_INTERVAL = 50; // Minimum interval between taps in milliseconds
    const CANDLE_SEGMENT_DURATION = 10; // Each candle represents 10 seconds
    const TOTAL_CANDLES = 6; // 60 seconds / 10 seconds per candle = 6 candles

    let startPrice = 0;
    let currentPrice = 0; // The price currently displayed (interpolated)
    let targetPrice = 0; // The price received from the server
    let canTap = false;
    let userTapCount = 0;
    let showTapIndicator = false; // Controls the pulsating "Tap to Push!" text
    let lastRedirect = 0; // Prevents multiple redirects on connection errors
    let animationFrameId = null; // Stores the ID for requestAnimationFrame for chart animation
    let tapIndicatorAnimationFrameId = null; // Stores the ID for requestAnimationFrame for tap indicator
    let lastTapTime = 0; // Timestamp of the last successful tap
    let lastTouchTime = 0; // For mobile tap rate limiting
    let playerFaction = null; // Store the player's assigned faction
    let pastPrices = []; // Store prices for the 6 x 10-second candles

    // Get matchId and token from URL parameters and local storage
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    // Redirect to lobby if essential parameters are missing or on rapid errors
    if (!matchId || !token) {
        const now = Date.now();
        if (now - lastRedirect > 1000) { // Throttle redirects
            lastRedirect = now;
            console.log('Missing matchId or authToken, redirecting to lobby');
            window.location.href = '/';
        }
        return; // Stop execution if redirecting
    }

    // --- Chart Utility Function ---
    /**
     * Maps a price value to a Y-coordinate on the canvas.
     * Price range: -MAX_PRICE_SWING to MAX_PRICE_SWING.
     * Canvas Y-axis: 0 (top) to canvas.height (bottom).
     * Inverse mapping: higher price is lower on the chart (smaller Y-value).
     */
    const priceToY = (price) => {
        // Normalize price from [-MAX_PRICE_SWING, MAX_PRICE_SWING] to [0, 1]
        const normalizedPrice = (price + MAX_PRICE_SWING) / (2 * MAX_PRICE_SWING);
        // Invert Y-axis (higher price = lower Y-coordinate on canvas)
        return canvas.height * (1 - normalizedPrice);
    };

    // Set up canvas dimensions (responsive)
    const resizeCanvas = () => {
        canvas.width = priceBox.offsetWidth;
        canvas.height = priceBox.offsetHeight;
        ctx.imageSmoothingEnabled = false; // For crisp pixel art
        drawChart(); // Redraw chart on resize
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial canvas setup

    // Initialize Socket.IO connection
    const socket = io({
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    // Handles player tap input
    const handleTap = () => {
        const tapNow = Date.now();
        if (canTap && (tapNow - lastTapTime >= MIN_TAP_INTERVAL)) {
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
            lastTapTime = tapNow;
            console.log(`Tap registered: userTapCount=${userTapCount}`);
        } else {
            console.log(`Tap rate-limited. Last tap: ${tapNow - lastTapTime}ms ago.`);
        }
    };

    // Event listeners for user input
    arenaContent.addEventListener('click', handleTap);
    arenaContent.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touchNow = Date.now();
        if (touchNow - lastTouchTime >= MIN_TAP_INTERVAL) {
            handleTap();
            lastTouchTime = touchNow;
        }
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
        if (canTap && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            handleTap();
        }
    });

    // Socket.IO event handlers
    socket.on('connect', () => {
        console.log('Socket connected, joining match:', matchId);
        socket.emit('joinMatch', { matchId });
    });

    socket.on('matchJoined', (data) => {
        console.log('Match joined:', data);
        playerFaction = data.faction.toUpperCase();
        factionIndicator.textContent = `FACTION: ${playerFaction}`;
        startPrice = parseFloat(data.start_price) || 0;
        currentPrice = startPrice;
        targetPrice = startPrice;
        pastPrices = Array(TOTAL_CANDLES).fill(startPrice); // Initialize with start price

        showTapIndicator = true;
        setTimeout(() => {
            showTapIndicator = false;
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
            tapIndicatorAnimationFrameId = null;
            drawChart(); // Redraw chart without indicator
            console.log('Tap indicator cleared');
        }, 3000);

        if (!animationFrameId) animationFrameId = requestAnimationFrame(animatePriceBox);
        if (!tapIndicatorAnimationFrameId) tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0; // New overall price
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
        console.log(`Game state update: newPrice=${targetPrice.toFixed(2)}, bullTaps=${data.bullTaps}, bearTaps=${data.bearTaps}`);
        
        // If a new 10-second segment just ended, push the old price and update
        if (data.candlePrice !== undefined) {
             pastPrices.shift(); // Remove the oldest price
             pastPrices.push(parseFloat(data.candlePrice)); // Add the new segmented price
             console.log("Past prices updated:", pastPrices);
        }

        if (!animationFrameId) animationFrameId = requestAnimationFrame(animatePriceBox);
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
        if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
        animationFrameId = null;
        tapIndicatorAnimationFrameId = null;

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
        const now = Date.now();
        if (now - lastRedirect > 1000) {
            lastRedirect = now;
            window.location.href = '/';
        }
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data.message);
        alert('An error occurred: ' + data.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`Socket reconnected after ${attemptNumber} attempts.`);
        canTap = true;
        if (matchId) {
            socket.emit('joinMatch', { matchId });
        }
    });

    /**
     * Draws the 8-bit style chart on the canvas, including past "candles" and the active candle.
     */
    function drawChart() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
        ctx.imageSmoothingEnabled = false; // For crisp pixel art

        // Draw the static middle line (zero price line)
        ctx.strokeStyle = '#FFFFFF'; // White line
        ctx.lineWidth = 2; // Thicker for emphasis
        const midY = priceToY(0);
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(canvas.width, midY);
        ctx.stroke();

        // Calculate dimensions for all candles
        const totalCandleAreaWidth = canvas.width * 0.8; // Use 80% of width for candles
        const singleCandleWidth = Math.max(5, totalCandleAreaWidth / (TOTAL_CANDLES + 1)); // +1 for the active candle
        const spacing = (canvas.width - (singleCandleWidth * (TOTAL_CANDLES + 1))) / (TOTAL_CANDLES + 2); // Even spacing

        // Draw past "candles" (as simple vertical lines for 8-bit clarity)
        pastPrices.forEach((price, index) => {
            if (index === TOTAL_CANDLES) return; // Skip last one, which is the current active candle

            const candleX = spacing + (index * (singleCandleWidth + spacing));
            const clampedPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, price));
            
            let candleColor;
            let candleHeight = Math.max(2, Math.abs(clampedPrice / MAX_PRICE_SWING) * (canvas.height * 0.4)); // Shorter lines for history

            let candleStartY; // Top of the line (lower Y value)
            let candleEndY;   // Bottom of the line (higher Y value)

            if (clampedPrice > 0) {
                candleColor = '#00FF00'; // Green
                candleStartY = priceToY(clampedPrice);
                candleEndY = midY;
            } else if (clampedPrice < 0) {
                candleColor = '#FF0000'; // Red
                candleStartY = midY;
                candleEndY = priceToY(clampedPrice);
            } else {
                candleColor = '#FFFFFF'; // White
                candleStartY = midY - 1;
                candleEndY = midY + 1;
                candleHeight = 2;
            }

            ctx.strokeStyle = candleColor;
            ctx.lineWidth = 3; // Line thickness
            ctx.beginPath();
            ctx.moveTo(candleX + singleCandleWidth / 2, candleStartY);
            ctx.lineTo(candleX + singleCandleWidth / 2, candleEndY);
            ctx.stroke();
        });


        // Draw the current active "candle" (much larger and clearer)
        const activeCandleX = spacing + (TOTAL_CANDLES * (singleCandleWidth + spacing)); // Position after historical candles
        const clampedCurrentPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, currentPrice));

        let activeCandleColor;
        let activeCandleHeight = Math.max(5, Math.abs(clampedCurrentPrice / MAX_PRICE_SWING) * (canvas.height * 0.7)); // Much taller

        let activeCandleTopY; // Top Y-coordinate for the rectangle
        let activeCandleDrawHeight; // Actual height to draw (positive)

        if (clampedCurrentPrice > 0) { // Bullish: Green
            activeCandleColor = '#00FF00';
            activeCandleTopY = priceToY(clampedCurrentPrice);
            activeCandleDrawHeight = midY - activeCandleTopY;
        } else if (clampedCurrentPrice < 0) { // Bearish: Red
            activeCandleColor = '#FF0000';
            activeCandleTopY = midY;
            activeCandleDrawHeight = priceToY(clampedCurrentPrice) - midY;
        } else { // Neutral: White (small line at zero)
            activeCandleColor = '#FFFFFF';
            activeCandleTopY = midY - 2;
            activeCandleDrawHeight = 4;
        }
        activeCandleDrawHeight = Math.max(1, activeCandleDrawHeight); // Ensure minimum height

        ctx.fillStyle = activeCandleColor;
        ctx.fillRect(activeCandleX, activeCandleTopY, singleCandleWidth, activeCandleDrawHeight);


        // Draw current price value (without dollar sign)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px "Press Start 2P"'; // Slightly larger for current price
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const priceText = `${currentPrice.toFixed(2)}`; // No dollar sign
        ctx.fillText(priceText, activeCandleX + singleCandleWidth / 2, priceToY(clampedCurrentPrice) - 30); // Position above/below the candle

    }

    /**
     * Animates the currentPrice smoothly towards the targetPrice.
     * Redraws the chart on each frame to show the active candle moving.
     */
    function animatePriceBox() {
        const easingFactor = 0.1;
        currentPrice += (targetPrice - currentPrice) * easingFactor;

        if (Math.abs(targetPrice - currentPrice) < 0.01) {
            currentPrice = targetPrice;
            drawChart();
            animationFrameId = null;
            return;
        }

        drawChart();
        animationFrameId = requestAnimationFrame(animatePriceBox);
    }

    /**
     * Animates the "Tap to Push!" text on the canvas with pulsating opacity.
     * This animation is drawn on top of the current chart.
     */
    function animateTapIndicator() {
        if (!showTapIndicator) {
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
            tapIndicatorAnimationFrameId = null;
            drawChart(); // Redraw chart to remove the indicator
            return;
        }

        drawChart(); // Always draw the base chart first

        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.font = '16px "Press Start 2P"'; // Larger for indicator
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP TO PUSH!', canvas.width / 2, canvas.height / 2); // Center the text

        tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    }
});