// arena.js
document.addEventListener('DOMContentLoaded', () => {
    const arenaContent = document.getElementById('arenaContent');
    const factionIndicator = document.getElementById('factionIndicator');
    const timerDisplay = document.getElementById('timer');
    const countdownDisplay = document.getElementById('countdown');
    const bullsScoreDisplay = document.querySelector('#bullsScore');
    const bearsScoreDisplay = document.querySelector('#bearsScore');
    const userTapCountDisplay = document.getElementById('userTapCount');
    const priceBox = document.getElementById('priceBox');
    const MAX_PRICE_SWING = 15.00; // Max deviation from 0.00
    const MIN_TAP_INTERVAL = 50; // Minimum interval between taps in milliseconds

    let startPrice = 0;
    let currentPrice = 0; // The price currently displayed (interpolated)
    let targetPrice = 0; // The price received from the server
    let canTap = false;
    let userTapCount = 0;
    let showTapIndicator = false; // Controls the pulsating "Tap to Push!" text
    let lastRedirect = 0; // Prevents multiple redirects on connection errors
    let animationFrameId = null; // Stores the ID for requestAnimationFrame for price animation
    let tapIndicatorAnimationFrameId = null; // Stores the ID for requestAnimationFrame for tap indicator
    let lastTapTime = 0; // Timestamp of the last successful tap
    let lastTouchTime = 0; // For mobile tap rate limiting

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
        // Enforce client-side rate limiting to prevent spamming
        if (canTap && (tapNow - lastTapTime >= MIN_TAP_INTERVAL)) {
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
            lastTapTime = tapNow; // Update last tap time
            console.log(`Tap registered: userTapCount=${userTapCount}`);
        } else {
            console.log(`Tap rate-limited. Last tap: ${tapNow - lastTapTime}ms ago.`);
        }
    };

    // Event listeners for user input
    arenaContent.addEventListener('click', handleTap);
    arenaContent.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default touch behavior (e.g., scrolling, zooming)
        const touchNow = Date.now();
        if (touchNow - lastTouchTime >= MIN_TAP_INTERVAL) {
            handleTap();
            lastTouchTime = touchNow;
        }
    }, { passive: false }); // Use passive: false to allow preventDefault
    document.addEventListener('keydown', (e) => {
        if (canTap && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault(); // Prevent default space/enter key actions (e.g., button click, scroll)
            handleTap();
        }
    });

    // Socket.IO event handlers

    socket.on('connect', () => {
        console.log('Socket connected, joining match:', matchId);
        socket.emit('joinMatch', { matchId }); // Request to join the specific match
    });

    socket.on('matchJoined', (data) => {
        console.log('Match joined:', data);
        factionIndicator.textContent = `FACTION: ${data.faction.toUpperCase()}`; // Display player's faction
        startPrice = parseFloat(data.start_price) || 0;
        currentPrice = startPrice; // Set initial displayed price
        targetPrice = startPrice; // Set initial target price

        showTapIndicator = true; // Show "Tap to Push!" indicator initially
        // Schedule indicator to hide after 3 seconds
        setTimeout(() => {
            showTapIndicator = false;
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId); // Stop indicator animation
            priceBox.style.backgroundImage = 'none'; // Remove indicator canvas background
            tapIndicatorAnimationFrameId = null; // Clear its animation frame ID
            console.log('Tap indicator cleared');
        }, 3000);

        // Start the price animation loop if not already running
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(animatePriceBox);
        }
        // Start the tap indicator animation loop if not already running
        if (!tapIndicatorAnimationFrameId) {
            tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator);
        }
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0; // Update target price from server
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
        console.log(`Game state update: newPrice=${targetPrice.toFixed(2)}, bullTaps=${data.bullTaps}, bearTaps=${data.bearTaps}`);
        // Ensure price box animation is running to smoothly transition to new price
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(animatePriceBox);
        }
    });

    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    socket.on('countdown', (data) => {
        countdownDisplay.textContent = `Starting in ${data.countdown}`;
        if (data.countdown <= 0) {
            countdownDisplay.textContent = ''; // Clear countdown text
            canTap = true; // Enable tapping when countdown finishes
        }
    });

    socket.on('matchEnd', (data) => {
        console.log('Match ended:', data);
        // Disable input and stop all animations
        arenaContent.removeEventListener('click', handleTap);
        arenaContent.removeEventListener('touchstart', handleTap);
        document.removeEventListener('keydown', handleTap);
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
        animationFrameId = null;
        tapIndicatorAnimationFrameId = null;

        // Construct leaderboard HTML with proper classes for consistent 8-bit styling
        const leaderboardHTML = data.leaderboard.map(player =>
            `<div class="leaderboard-entry"><span class="leaderboard-username">${player.username}</span>: <span class="leaderboard-taps">${player.tap_count} taps</span></div>`
        ).join('');

        // Update arena content with game over screen
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
        // Add event listener for return to lobby button
        document.getElementById('lobbyReturnButton').addEventListener('click', () => {
            window.location.href = '/';
        });
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
        // Redirect to lobby to prevent being stuck on a broken connection
        const now = Date.now();
        if (now - lastRedirect > 1000) { // Throttle redirects to avoid loops
            lastRedirect = now;
            window.location.href = '/';
        }
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data.message);
        alert('An error occurred: ' + data.message); // Inform user of server-side errors
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
        // Rely on automatic reconnection logic to handle UI updates
        // No alert here, as reconnection attempts will follow
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`Socket reconnected after ${attemptNumber} attempts.`);
        canTap = true; // Re-enable tapping
        if (matchId) { // Re-join the match to get the latest state
            socket.emit('joinMatch', { matchId });
        }
    });

    /**
     * Updates the visual representation of the price box background.
     * The background is a linear gradient that shifts based on the 'currentPrice'.
     */
    function updatePriceBox() {
        // Clamp currentPrice within the defined swing limits for visual representation
        const clampedPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, currentPrice));

        // Map clampedPrice (-15 to +15) to a percentage (0% to 100%) for the gradient.
        // 0.00 price means 50% red, 50% green.
        // MAX_PRICE_SWING (15) means 0% red, 100% green.
        // -MAX_PRICE_SWING (-15) means 100% red, 0% green.
        const greenPercentage = 50 + (clampedPrice / MAX_PRICE_SWING) * 50;
        const redPercentage = 100 - greenPercentage;

        // Apply the linear gradient to the priceBox background.
        // The white line will naturally sit at the transition point.
        priceBox.style.background = `linear-gradient(to bottom, #FF0000 ${redPercentage}%, #00FF00 ${greenPercentage}%)`;
        // Removed `transform: translateY` as it was causing the "whole block moves" effect.
    }

    /**
     * Animates the 'currentPrice' smoothly towards the 'targetPrice' using linear interpolation.
     * This creates the visual 'push' effect on the gradient.
     */
    function animatePriceBox() {
        const easingFactor = 0.1; // Determines how fast currentPrice catches up to targetPrice (0-1)
        currentPrice += (targetPrice - currentPrice) * easingFactor;

        // Stop the animation loop if the current price is very close to the target price
        // This prevents unnecessary `requestAnimationFrame` calls.
        if (Math.abs(targetPrice - currentPrice) < 0.01) {
            currentPrice = targetPrice; // Snap to the final target value to avoid floating point inaccuracies
            updatePriceBox(); // One last update for perfect alignment
            animationFrameId = null; // Clear the animation frame ID
            return; // Stop the animation loop
        }

        updatePriceBox(); // Update the visual display with the new interpolated price
        animationFrameId = requestAnimationFrame(animatePriceBox); // Continue the animation
    }

    /**
     * Animates the "Tap to Push!" text indicator with a pulsating opacity.
     * This animation is independent of the price movement.
     */
    function animateTapIndicator() {
        if (!showTapIndicator) {
            if (tapIndicatorAnimationFrameId) cancelAnimationFrame(tapIndicatorAnimationFrameId);
            priceBox.style.backgroundImage = 'none'; // Remove the canvas background when not showing
            tapIndicatorAnimationFrameId = null;
            return;
        }

        // Create a temporary canvas element for the text
        const canvas = document.createElement('canvas');
        canvas.width = priceBox.offsetWidth;
        canvas.height = 30; // Height allocated for the text
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // Essential for crisp pixelated text

        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150); // Calculate pulsating opacity
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`; // White text color with changing opacity
        ctx.font = '10px "Press Start 2P"'; // Apply the retro font
        ctx.textAlign = 'center'; // Center the text horizontally
        ctx.fillText('Tap to Push!', canvas.width / 2, 20); // Position the text vertically

        // Apply the canvas as a background image to the priceBox
        priceBox.style.backgroundImage = `url(${canvas.toDataURL()})`;
        priceBox.style.backgroundPosition = `center bottom`; // Position at the bottom
        priceBox.style.backgroundRepeat = `no-repeat`; // Do not repeat the image

        tapIndicatorAnimationFrameId = requestAnimationFrame(animateTapIndicator); // Continue this animation loop
    }
});