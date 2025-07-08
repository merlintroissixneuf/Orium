document.addEventListener('DOMContentLoaded', () => {
    const factionIndicator = document.getElementById('factionIndicator');
    const priceValue = document.getElementById('priceValue');
    const tapButton = document.getElementById('tapButton');
    const timerDisplay = document.getElementById('timer');
    const bullsScoreDisplay = document.getElementById('bullsScore');
    const bearsScoreDisplay = document.getElementById('bearsScore');

    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('matchId');

    if (!matchId) {
        document.querySelector('.container').innerHTML = '<h2>Error: No Match ID found.</h2>';
        return;
    }

    const socket = io({
        auth: { token: localStorage.getItem('authToken') }
    });

    socket.on('connect', () => {
        socket.emit('joinMatch', { matchId });
    });

    tapButton.addEventListener('click', () => {
        socket.emit('playerTap', { matchId });
    });

    socket.on('matchJoined', (data) => {
        factionIndicator.textContent = `FACTION: ${data.faction}`;
        factionIndicator.style.color = data.faction === 'BULLS' ? '#00FF00' : '#FF0000';
    });
    
    // Listen for the new, combined game state update
    socket.on('gameStateUpdate', (data) => {
        priceValue.textContent = Number(data.newPrice).toFixed(2);
        bullsScoreDisplay.textContent = `BULLS: ${data.bullTaps || 0}`;
        bearsScoreDisplay.textContent = `BEARS: ${data.bearTaps || 0}`;
    });

    // Listen for time updates
    socket.on('timeUpdate', (data) => {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = data.remainingTime % 60;
        timerDisplay.textContent = `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    // Listen for the end of the match
    socket.on('matchEnd', (data) => {
        tapButton.disabled = true;
        tapButton.textContent = 'GAME OVER';
        document.querySelector('.container').style.borderColor = '#FF0000';
    });

    socket.on('connect_error', (err) => {
        alert(err.message);
        window.location.href = '/';
    });

    socket.on('error', (data) => {
        alert('An error occurred: ' + data.message);
    });
});