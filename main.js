function say(text) {
    const log = document.getElementById('story-log');
    const newEntry = document.createElement('div');
    newEntry.className = 'entry';
    newEntry.innerHTML = `<p>${text}</p>`;
    log.appendChild(newEntry);
    
    // 自动滚动到底部
    log.scrollTop = log.scrollHeight;
}
