document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const tapButton = document.getElementById('tapButton');
    const timerDisplay = document.getElementById('timer');
    const bullsScoreDisplay = document.querySelector('#bullsScore .score-text');
    const bearsScoreDisplay = document.querySelector('#bearsScore .score-text');
    const bullsFill = document.getElementById('bullsFill');
    const bearsFill = document.getElementById('bearsFill');
    const bullsTargetDisplay = document.getElementById('bullsTarget');
    const bearsTargetDisplay = document.getElementById('bearsTarget');

    // --- State ---
    let bullTargetPrice = 0;
    let bearTargetPrice = 0;
    let startPrice = 150;

    // --- Connection ---
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');
    const token = localStorage.getItem('authToken');

    if (!matchId || !token) {
        document.querySelector('.container').innerHTML = '<h2>Error: Missing match or auth data.</h2>';
        return;
    }

    const socket = io({ auth: { token } });

    socket.on('connect', () => {
        socket.emit('joinMatch', { matchId });
    });

    tapButton.addEventListener('click', () => socket.emit('playerTap', { matchId }) );

    // --- Event Listeners ---
    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        factionIndicator.style.color = data.faction === 'BULLS' ? '#00FF00' : '#FF0000';
    });

    socket.on('matchData', (data) => {
        bullTargetPrice = parseFloat(data.bullTarget);
        bearTargetPrice = parseFloat(data.bearTarget);
        startPrice = parseFloat(data.startPrice);
        bullsTargetDisplay.textContent = `TARGET: ${bullTargetPrice.toFixed(2)}`;
        bearsTargetDisplay.textContent = `TARGET: ${bearTargetPrice.toFixed(2)}`;
    });
    
    socket.on('gameStateUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;

        // Update liquid fill
        const bullProgress = Math.min(100, (Math.max(0, data.newPrice - startPrice) / (bullTargetPrice - startPrice)) * 100);
        const bearProgress = Math.min(100, (Math.max(0, startPrice - data.newPrice) / (startPrice - bearTargetPrice)) * 100);
        bullsFill.style.height = `${bullProgress}%`;
        bearsFill.style.height = `${bearProgress}%`;
    });

    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    socket.on('matchEnd', (data) => {
        tapButton.disabled = true;
        tapButton.textContent = 'GAME OVER';
        document.querySelector('.container').style.borderColor = '#FF0000';
    });

    socket.on('connect_error', (err) => { window.location.href = '/'; });
    socket.on('error', (data) => { alert('An error occurred: ' + data.message); });
});