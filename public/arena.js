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
            console.log(`Tap registered: userTapCount=${userTapCount}, currentPrice=${currentPrice}, targetPrice=${targetPrice}`);
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
            updatePriceBox();
            priceBox.style.backgroundImage = 'none';
            console.log('Tap indicator cleared');
        }, 3000);
        updatePriceBox();
        if (showTapIndicator) animationFrameId = requestAnimationFrame(animateTapIndicator);
        startCountdown();
    });

    socket.on('gameStateUpdate', (data) => {
        targetPrice = parseFloat(data.newPrice) || 0;
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
        console.log(`Game state update: newPrice=${targetPrice}, bullTaps=${data.bullTaps}, bearTaps=${data.bearTaps}`);
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

    function updatePriceBox() {
        // Ensure price is within bounds
        currentPrice = Math.max(-MAX_PRICE_SWING, Math.min(MAX_PRICE_SWING, currentPrice));
        // Map currentPrice (-15 to +15) to gradient percentage (0% to 100%)
        const greenPercentage = 50 + (currentPrice / MAX_PRICE_SWING) * 50; // Green grows from bottom
        const redPercentage = 100 - greenPercentage; // Red grows from top
        priceBox.style.background = `linear-gradient(to bottom, #FF0000 ${redPercentage}%, #00FF00 ${greenPercentage}%)`;
        // Apply vertical oscillation
        const yOffset = oscillation > 0 ? Math.sin(Date.now() / 50) * oscillation : 0;
        priceBox.style.transform = `translateY(${yOffset}px)`;
        oscillation *= 0.9;
        if (oscillation < 0.1) oscillation = 0;
        console.log(`Price box updated: currentPrice=${currentPrice.toFixed(2)}, greenPercentage=${greenPercentage.toFixed(2)}%`);
    }

    function animatePriceBox() {
        const lerpFactor = 0.3; // Increased for faster response
        currentPrice += (targetPrice - currentPrice) * lerpFactor;
        if (Math.abs(currentPrice - targetPrice) < 0.01) currentPrice = targetPrice;
        updatePriceBox();
        if (Math.abs(currentPrice - targetPrice) > 0.01 || oscillation > 0) {
            animationFrameId = requestAnimationFrame(animatePriceBox);
        } else {
            animationFrameId = null;
        }
    }

    function animateTapIndicator() {
        if (!showTapIndicator) {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            updatePriceBox();
            priceBox.style.backgroundImage = 'none';
            return;
        }
        updatePriceBox();
        const canvas = document.createElement('canvas');
        canvas.width = priceBox.offsetWidth;
        canvas.height = 30;
        const ctx = canvas.getContext('2d');
        const now = Date.now();
        const opacity = 0.5 + 0.5 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('Tap to Push!', canvas.width / 2, 20);
        priceBox.style.backgroundImage = `url(${canvas.toDataURL()})`;
        priceBox.style.backgroundPosition = `center bottom`;
        priceBox.style.backgroundRepeat = `no-repeat`;
        animationFrameId = requestAnimationFrame(animateTapIndicator);
    }
});