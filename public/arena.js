document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // DOM Elements
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

    // Game State Variables
    let startPrice = 0;
    let currentPrice = 0;
    let maxDeviation = 0; // To be set based on startPrice for scaling
    let canTap = false;
    let userTapCount = 0;

    // URL Params and Auth
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        window.location.href = '/';
        return;
    }

    // Socket.IO Connection with improved reconnection settings
    const socket = io({
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5 // Add randomness to reconnection delay for better handling
    });

    // Tap Handling with visual feedback
    const handleTap = (event) => {
        if (canTap) {
            event.preventDefault(); // Prevent default touch/click behavior
            socket.emit('playerTap', { matchId });
            userTapCount++;
            userTapCountDisplay.textContent = `Your Taps: ${userTapCount}`;
            // Add visual feedback: brief animation on tap
            tapArea.classList.add('tap-feedback');
            setTimeout(() => tapArea.classList.remove('tap-feedback'), 200);
        }
    };

    tapArea.addEventListener('click', handleTap);
    tapArea.addEventListener('touchstart', handleTap, { passive: false });

    // Socket Event Listeners
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('joinMatch', { matchId });
    });

    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        startPrice = parseFloat(data.start_price);
        currentPrice = startPrice;
        maxDeviation = startPrice * 0.05 || 1; // 5% of start price or minimum 1
        drawCandle();
        startCountdown();
    });

    socket.on('gameStateUpdate', (data) => {
        currentPrice = data.newPrice;
        // Update maxDeviation dynamically if deviation exceeds current max
        const deviation = Math.abs(currentPrice - startPrice);
        if (deviation > maxDeviation) {
            maxDeviation = deviation * 1.1; // Adjust scale to fit
        }
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

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        alert('Connection error. Redirecting to lobby.');
        window.location.href = '/';
    });

    socket.on('error', (data) => {
        alert('An error occurred: ' + data.message);
    });

    socket.on('disconnect', () => {
        canTap = false;
        alert('Disconnected from server. Attempting to reconnect...');
    });

    socket.on('reconnect', () => {
        alert('Reconnected successfully!');
        canTap = true;
        socket.emit('joinMatch', { matchId });
    });

    // Countdown Function
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

    // Improved Candle Drawing Function
    function drawCandle() {
        const width = candleCanvas.width;
        const height = candleCanvas.height;
        candleCtx.clearRect(0, 0, width, height);

        const midY = height / 2;
        const deviation = currentPrice - startPrice;
        const absDeviation = Math.abs(deviation);
        const scale = (height / 2) / maxDeviation;
        const bodyHeight = absDeviation * scale;
        const color = deviation > 0 ? '#00FF00' : '#FF0000';
        const shadowLength = 10; // Fixed shadow length for visual enhancement

        candleCtx.fillStyle = color;
        candleCtx.strokeStyle = color;
        candleCtx.lineWidth = 2;

        let bodyTop;
        if (deviation > 0) {
            bodyTop = midY - bodyHeight;
        } else {
            bodyTop = midY;
        }

        // Draw body
        const bodyWidth = width / 2;
        const bodyLeft = width / 4;
        candleCtx.fillRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);

        // Draw wick (thin line through body and shadows)
        const wickCenter = width / 2;
        const wickTop = bodyTop - shadowLength;
        const wickBottom = bodyTop + bodyHeight + shadowLength;
        candleCtx.beginPath();
        candleCtx.moveTo(wickCenter, wickTop);
        candleCtx.lineTo(wickCenter, wickBottom);
        candleCtx.stroke();

        // Add price labels for better UX
        candleCtx.fillStyle = '#FFFFFF';
        candleCtx.font = '12px Arial';
        candleCtx.textAlign = 'left';
        candleCtx.fillText(`Start: ${startPrice.toFixed(2)}`, 10, 20);
        candleCtx.fillText(`Current: ${currentPrice.toFixed(2)}`, 10, 40);
    }
});
