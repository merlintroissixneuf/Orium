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
    const MAX_PRICE_SWING = 15.00;
    const MIN_TAP_INTERVAL = 50; // Minimum interval between taps in milliseconds

    let startPrice = 0;
    let currentPrice = 0; // The price currently displayed
    let targetPrice = 0; // The price the server sent
    let canTap = false;
    let userTapCount = 0;
    let showTapIndicator = false; // Controls the pulsating "Tap to Push!" text
    let lastRedirect = 0; // Prevents multiple redirects on connection errors
    let animationFrameId = null; // Stores the ID for requestAnimationFrame
    let lastTapTime = 0; // Timestamp of the last successful tap
    let oscillation = 0; // Visual oscillation effect on tap
    let lastTouchTime = 0; // For mobile tap rate limiting

    // Get matchId and token from URL parameters and local storage
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    // Redirect to lobby if essential parameters are missing or on rapid errors
    const now = Date.now();
    if (!matchId || !token) {
        if (now - lastRedirect > 1000) { // Throttle redirects
            lastRedirect = now;
            console.log('Missing matchId or authToken, redirecting to lobby');
            window.location.href = '/';
        }
        return;
    }

    // Initialize Socket.IO connection with authentication and reconnection logic
    const socket = io({ auth: { token }, reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

    // Handles player tap input (mouse click, touch, keyboard)
    const handleTap = () => {
        const tapNow = Date.now(); // Get current time for this specific tap event
        // Enforce client-side rate limiting
        if (canTap && (tapNow - lastTapTime >= MIN_TAP_INTERVAL)) {
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
            lastTapTime = tapNow; // Update last tap time
            oscillation = 2; // Trigger visual oscillation
            console.log(`Tap registered: userTapCount=${userTapCount}`);
        } else {
            console.log(`Tap rate-limited. Last tap: ${tapNow - lastTapTime}ms ago.`);
        }
    };

    // Event listeners for user input
    arenaContent.addEventListener('click', handleTap);
    arenaContent.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default touch behavior like scrolling
        const touchNow = Date.now();
        if (touchNow - lastTouchTime >= MIN_TAP_INTERVAL) { // Touch-specific rate limit
            handleTap();
            lastTouchTime = touchNow;
        }
    }, { passive: false }); // Use passive: false to allow preventDefault
    document.addEventListener('keydown', (e) => {
        if (canTap && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault(); // Prevent default space/enter key actions (e.g., button click)
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
        
        showTapIndicator = true; // Show "Tap to Push!" indicator
        setTimeout(() => {
            showTapIndicator = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId); // Stop indicator animation
            updatePriceBox(); // Final update without indicator
            priceBox.style.backgroundImage = 'none'; // Remove indicator canvas background
            animationFrameId = null; // Clear animation frame ID for indicator
            console.log('Tap indicator cleared');
        }, 3000); // Hide indicator after 3 seconds
        
        updatePriceBox(); // Initial render of the price box
        // Start the price animation loop if not already running
        if (!animationFrameId) animationFrameId = requestAnimationFrame(animatePriceBox);
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0; // Update target price from server
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
        console.log(`Game state update: newPrice=${targetPrice.toFixed(2)}, bullTaps=${data.bullTaps}, bearTaps=${data.bearTaps}`);
        // Ensure price box animation is running to smoothly transition to new price
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
            countdownDisplay.textContent = ''; // Clear countdown text
            canTap = true; // Enable tapping when countdown finishes
        }
    });

    socket.on('matchEnd', (data) => {
        console.log('Match ended:', data);
        // Disable input and stop animations
        arenaContent.removeEventListener('click', handleTap);
        arenaContent.removeEventListener('touchstart', handleTap);
        document.removeEventListener('keydown', handleTap);
        canTap = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        // Construct leaderboard HTML with proper classes for styling
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
        // Implement a more robust error display or re-queue logic if needed.
        // For now, redirect to lobby to prevent being stuck.
        if (Date.now() - lastRedirect > 1000) { // Prevent rapid redirection loops
            lastRedirect = Date.now();
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
        // Only alert if disconnection is unexpected and not a planned match end
        if (reason === 'io server disconnect') {
            // The server initiated the disconnect, often after a match ends
            console.log('Server initiated disconnect.');
        } else {
            console.warn('Unexpected socket disconnection.');
        }
        // No alert here, rely on automatic reconnection or user action
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`Socket reconnected after ${attemptNumber} attempts.`);
        canTap = true; // Re-enable tapping after reconnection
        // Re-join the match to get the latest state if it's still active
        if (matchId) {
            socket.emit('joinMatch', { matchId });
        }
    });

    /**
     * Updates the visual representation of the price box.
     * Clamps the price, calculates gradient percentages, applies oscillation,
     * and forces a DOM repaint for immediate visual update.
     */
    function updatePriceBox() {
        // Clamp currentPrice within the defined swing limits
        const clampedPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, currentPrice));
        
        // Calculate gradient percentages. Green grows from bottom (0% at -MAX_PRICE_SWING, 100% at MAX_PRICE_SWING).
        // Red is the inverse.
        const greenPercentage = 50 + (clampedPrice / MAX_PRICE_SWING) * 50;
        const redPercentage = 100 - greenPercentage;
        
        priceBox.style.background = `linear-gradient(to bottom, #FF0000 ${redPercentage}%, #00FF00 ${greenPercentage}%)`;
        
        // Apply vertical oscillation for visual tap feedback
        const yOffset = oscillation > 0 ? Math.sin(Date.now() / 50) * oscillation : 0;
        priceBox.style.transform = `translateY(${yOffset}px)`;
        oscillation *= 0.9; // Decay oscillation over time
        if (oscillation < 0.1) oscillation = 0; // Stop oscillation if it's too small

        // No need to force DOM repaint explicitly like this, browser handles it for transform/background
        // priceBox.style.display = 'none';
        // priceBox.offsetHeight; // Trigger reflow
        // priceBox.style.display = 'block';

        // console.log(`Price box updated: currentPrice=${currentPrice.toFixed(2)}, greenPercentage=${greenPercentage.toFixed(2)}%`);
    }

    /**
     * Animates the currentPrice towards the targetPrice using linear interpolation (lerp).
     * Continues to request animation frames until currentPrice is close to targetPrice
     * and oscillation has faded.
     */
    function animatePriceBox() {
        const easingFactor = 0.1; // Controls the speed of price transition (0.1 means 10% of remaining diff per frame)
        currentPrice += (targetPrice - currentPrice) * easingFactor;

        // Stop the animation if the price is very close to target and oscillation has stopped
        if (Math.abs(targetPrice - currentPrice) < 0.01 && oscillation < 0.1) {
            currentPrice = targetPrice; // Snap to target to prevent floating point residue
            updatePriceBox(); // Final update
            animationFrameId = null; // Clear the animation frame ID
            return; // Stop the animation loop
        }

        updatePriceBox(); // Update the visual display
        animationFrameId = requestAnimationFrame(animatePriceBox); // Continue animation
    }

    /**
     * Animates the "Tap to Push!" indicator with pulsating opacity.
     * This runs separately from the main price animation.
     */
    function animateTapIndicator() {
        if (!showTapIndicator) {
            if (animationFrameId) cancelAnimationFrame(animationFrameId); // Stop animation if not needed
            priceBox.style.backgroundImage = 'none'; // Remove the canvas background
            animationFrameId = null; // Clear its animation frame ID
            return;
        }

        // Create a temporary canvas for the pulsating text
        const canvas = document.createElement('canvas');
        canvas.width = priceBox.offsetWidth;
        canvas.height = 30; // Height for the text
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // For crisp pixel art text

        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150); // Pulsating effect
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`; // White pulsating text
        ctx.font = '10px "Press Start 2P"'; // Apply the 8-bit font
        ctx.textAlign = 'center';
        ctx.fillText('Tap to Push!', canvas.width / 2, 20); // Center text vertically and horizontally

        // Set the canvas as the background image of the price box
        priceBox.style.backgroundImage = `url(${canvas.toDataURL()})`;
        priceBox.style.backgroundPosition = `center bottom`;
        priceBox.style.backgroundRepeat = `no-repeat`;

        animationFrameId = requestAnimationFrame(animateTapIndicator); // Continue animation
    }
});