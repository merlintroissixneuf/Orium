// arena.js
document.addEventListener('DOMContentLoaded', () => {
    const arenaContent = document.getElementById('arenaContent');
    const factionIndicator = document.getElementById('factionIndicator');
    const timerDisplay = document.getElementById('timer');
    const countdownDisplay = document.getElementById('countdown');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const priceBox = document.getElementById('priceBox'); // This will now be our canvas container
    
    // Create and append the canvas element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.id = 'priceChartCanvas';
    priceBox.appendChild(canvas);

    const MAX_PRICE_SWING = 15.00; // Max deviation from 0.00
    const MIN_TAP_INTERVAL = 50; // Minimum interval between taps in milliseconds

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

    // Set up canvas dimensions (responsive)
    const resizeCanvas = () => {
        canvas.width = priceBox.offsetWidth;
        canvas.height = priceBox.offsetHeight;
        ctx.imageSmoothingEnabled = false; // For crisp pixel art
        drawChart(); // Redraw chart on resize
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial canvas setup

    // Initialize Socket.IO connection with authentication and reconnection logic
    const socket = io({
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    // Handles player tap input (mouse click, touch, keyboard)
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
        playerFaction = data.faction.toUpperCase(); // Store player's faction
        factionIndicator.textContent = `FACTION: ${playerFaction}`;
        startPrice = parseFloat(data.start_price) || 0;
        currentPrice = startPrice;
        targetPrice = startPrice;

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
        targetPrice = parseFloat(data.newPrice) || 0;
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
        console.log(`Game state update: newPrice=${targetPrice.toFixed(2)}, bullTaps=${data.bullTaps}, bearTaps=${data.bearTaps}`);
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

    // --- Chart Drawing Functions ---

    /**
     * Maps a price value to a Y-coordinate on the canvas.
     * Price range: -MAX_PRICE_SWING to MAX_PRICE_SWING.
     * Canvas Y-axis: 0 (top) to canvas.height (bottom).
     * Inverse mapping: higher price is higher on the chart (smaller Y-value).
     */
    const priceToY = (price) => {
        // Normalize price from [-MAX_PRICE_SWING, MAX_PRICE_SWING] to [0, 1]
        const normalizedPrice = (price + MAX_PRICE_SWING) / (2 * MAX_PRICE_SWING);
        // Invert Y-axis (higher price = lower Y-coordinate on canvas)
        return canvas.height * (1 - normalizedPrice);
    };

    /**
     * Draws the 8-bit style chart on the canvas, including grid and candle.
     */
    function drawChart() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
        ctx.imageSmoothingEnabled = false; // Always ensure pixelated drawing

        // Draw background grid (optional, but good for 8-bit feel)
        ctx.strokeStyle = '#333333'; // Dark grey for grid lines
        ctx.lineWidth = 1;
        // Horizontal lines
        for (let i = 0; i <= 10; i++) { // 10 lines for basic grid
            const y = (canvas.height / 10) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = (canvas.width / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Draw the static middle line (zero price line)
        ctx.strokeStyle = '#FFFFFF'; // White for the middle line
        ctx.lineWidth = 2; // Thicker line for emphasis
        const midY = priceToY(0);
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(canvas.width, midY);
        ctx.stroke();

        // Draw the current "candle"
        const candleWidth = Math.max(5, canvas.width / 10); // Responsive candle width, min 5px
        const candleX = (canvas.width / 2) - (candleWidth / 2); // Center the candle
        const candleHeight = Math.max(5, Math.abs(currentPrice / MAX_PRICE_SWING) * canvas.height / 2); // Height proportional to price magnitude
        
        let candleY;
        let candleColor;

        if (currentPrice > 0) { // Bulls pushing up (Green)
            candleColor = '#00FF00'; // Green
            candleY = midY - candleHeight; // Start drawing from midY and go up
        } else if (currentPrice < 0) { // Bears pushing down (Red)
            candleColor = '#FF0000'; // Red
            candleY = midY; // Start drawing from midY and go down
        } else { // Price is 0 (neutral)
            candleColor = '#FFFFFF'; // White (or transparent, depending on preference)
            candleY = midY - 2; // A small line if exactly zero
            candleHeight = 4;
        }

        ctx.fillStyle = candleColor;
        ctx.fillRect(candleX, candleY, candleWidth, candleHeight);

        // Draw current price text overlay (optional, but useful)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const priceText = `$${currentPrice.toFixed(2)}`;
        ctx.fillText(priceText, canvas.width / 2, priceToY(currentPrice) - 20); // Position above the candle
        
        // Draw the faction-specific indicators
        if (playerFaction) {
            ctx.fillStyle = playerFaction === 'BULLS' ? '#00FF00' : '#FF0000';
            ctx.fillText(playerFaction, canvas.width / 2, priceToY(currentPrice) + 20); // Position below the candle
        }
    }

    /**
     * Animates the currentPrice towards the targetPrice using linear interpolation (lerp).
     * Redraws the chart on each frame.
     */
    function animatePriceBox() {
        const easingFactor = 0.1;
        currentPrice += (targetPrice - currentPrice) * easingFactor;

        // Stop animation if currentPrice is very close to targetPrice
        if (Math.abs(targetPrice - currentPrice) < 0.01) {
            currentPrice = targetPrice;
            drawChart(); // Final draw
            animationFrameId = null;
            return;
        }

        drawChart(); // Redraw chart
        animationFrameId = requestAnimationFrame(animatePriceBox);
    }

    /**
     * Animates the "Tap to Push!" text on the canvas with pulsating opacity.
     * This runs independently of the main chart animation.
     */
    function animateTapIndicator() {
        if (!showTapIndicator) {
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
            tapIndicatorAnimationFrameId = null;
            drawChart(); // Re-draw chart to remove indicator
            return;
        }

        // Draw chart first to get the base
        drawChart();

        // Now draw the pulsating text on top
        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150); // Pulsating effect
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Tap to Push!', canvas.width / 2, canvas.height / 2); // Center the text

        tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
    }
});