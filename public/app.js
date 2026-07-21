// Socket connection initialization
const socket = io();

// Store local audience vote state
let myVote = sessionStorage.getItem('wilty_my_vote') || null;

document.addEventListener('DOMContentLoaded', () => {
  // Determine page role
  const isDisplay = document.getElementById('display-view');
  const isAudience = document.getElementById('audience-view');
  const isAdmin = document.getElementById('admin-view');

  if (isDisplay) initDisplayView();
  if (isAudience) initAudienceView();
  if (isAdmin) initAdminView();
});

// ============================================================================
// 1. DISPLAY SCREEN LOGIC
// ============================================================================
function initDisplayView() {
  const statementElem = document.getElementById('display-statement');
  const speakerElem = document.getElementById('display-speaker');
  const qrImg = document.getElementById('qr-code-img');
  const qrUrlPill = document.getElementById('qr-url-pill');
  const statusBadge = document.getElementById('display-status-badge');
  const statusDot = document.getElementById('display-status-dot');
  const statusText = document.getElementById('display-status-text');

  const truthBar = document.getElementById('truth-bar-fill');
  const lieBar = document.getElementById('lie-bar-fill');
  const truthPercent = document.getElementById('truth-percent');
  const liePercent = document.getElementById('lie-percent');
  const truthCount = document.getElementById('truth-count');
  const lieCount = document.getElementById('lie-count');
  const totalVotesElem = document.getElementById('total-votes-count');

  const revealBanner = document.getElementById('display-reveal-banner');
  const revealTitleMain = document.getElementById('reveal-title-main');
  const revealTitleSub = document.getElementById('reveal-title-sub');

  // Fetch QR code & network info
  fetch('/api/info')
    .then(res => res.json())
    .then(data => {
      if (qrImg && data.qrDataUrl) {
        qrImg.src = data.qrDataUrl;
      }
      if (qrUrlPill && data.audienceUrl) {
        qrUrlPill.textContent = data.audienceUrl;
      }
    })
    .catch(err => console.error('Failed to load QR code:', err));

  // Receive state updates
  socket.on('state-update', (data) => {
    // Statement and Speaker
    if (statementElem) statementElem.textContent = data.statement || 'Waiting for presenter...';
    if (speakerElem) speakerElem.textContent = data.speaker || 'Presenter';

    // Status Badge
    updateStatusBadge(statusDot, statusText, data.phase);

    // Votes & Tallies
    const { truth, lie, total } = data.tallies || { truth: 0, lie: 0, total: 0 };
    const truthPctVal = total > 0 ? Math.round((truth / total) * 100) : 0;
    const liePctVal = total > 0 ? Math.round((lie / total) * 100) : 0;

    if (truthBar) truthBar.style.width = `${truthPctVal}%`;
    if (lieBar) lieBar.style.width = `${liePctVal}%`;
    if (truthPercent) truthPercent.textContent = `${truthPctVal}%`;
    if (liePercent) liePercent.textContent = `${liePctVal}%`;
    if (truthCount) truthCount.textContent = `${truth} ${truth === 1 ? 'vote' : 'votes'}`;
    if (lieCount) lieCount.textContent = `${lie} ${lie === 1 ? 'vote' : 'votes'}`;
    if (totalVotesElem) totalVotesElem.textContent = `${total} Total ${total === 1 ? 'Vote' : 'Votes'}`;

    // Reveal Overlay
    if (data.phase === 'REVEALED' && data.correctAnswer) {
      if (revealBanner) {
        revealBanner.className = `reveal-banner reveal-${data.correctAnswer}`;
        if (revealTitleSub) revealTitleSub.textContent = `THE VERDICT IS:`;
        if (revealTitleMain) revealTitleMain.textContent = data.correctAnswer === 'TRUTH' ? "It's the TRUTH! 🎉" : "It's a LIE! ❌";
      }
    } else {
      if (revealBanner) revealBanner.className = 'reveal-banner';
    }
  });

  socket.on('connection-count', (count) => {
    const connElem = document.getElementById('display-connected-count');
    if (connElem) connElem.textContent = `${count} Connected`;
  });
}


// ============================================================================
// 2. AUDIENCE MOBILE VIEW LOGIC
// ============================================================================
function initAudienceView() {
  const statementElem = document.getElementById('audience-statement');
  const speakerElem = document.getElementById('audience-speaker');
  const btnTruth = document.getElementById('btn-vote-truth');
  const btnLie = document.getElementById('btn-vote-lie');
  const buttonsGrid = document.getElementById('vote-buttons-grid');
  const votedStatusBox = document.getElementById('voted-status-box');
  const votedBadgeChoice = document.getElementById('voted-badge-choice');

  const personalRevealCard = document.getElementById('personal-reveal-card');
  const personalRevealIcon = document.getElementById('personal-reveal-icon');
  const personalRevealTitle = document.getElementById('personal-reveal-title');
  const personalRevealSub = document.getElementById('personal-reveal-sub');

  // Voting click handlers
  if (btnTruth) {
    btnTruth.addEventListener('click', () => submitVote('TRUTH'));
  }
  if (btnLie) {
    btnLie.addEventListener('click', () => submitVote('LIE'));
  }

  function submitVote(choice) {
    myVote = choice;
    sessionStorage.setItem('wilty_my_vote', choice);
    socket.emit('submit-vote', choice);
    showVotedUI(choice);
  }

  function showVotedUI(choice) {
    if (btnTruth) btnTruth.disabled = true;
    if (btnLie) btnLie.disabled = true;
    if (votedStatusBox) votedStatusBox.classList.add('active');
    if (votedBadgeChoice) {
      votedBadgeChoice.className = `voted-badge-choice ${choice}`;
      votedBadgeChoice.textContent = `YOU VOTED: ${choice}`;
    }
  }

  socket.on('vote-acknowledged', (data) => {
    showVotedUI(data.choice);
  });

  socket.on('state-update', (data) => {
    if (statementElem) statementElem.textContent = data.statement || 'Waiting for statement...';
    if (speakerElem) speakerElem.textContent = data.speaker || 'Presenter';

    // If phase transitions to VOTING and we haven't voted yet for this statement
    if (data.phase === 'VOTING') {
      if (personalRevealCard) personalRevealCard.className = 'personal-reveal-card';
      if (!myVote) {
        if (btnTruth) btnTruth.disabled = false;
        if (btnLie) btnLie.disabled = false;
        if (votedStatusBox) votedStatusBox.classList.remove('active');
      } else {
        showVotedUI(myVote);
      }
    } else if (data.phase === 'LOCKED') {
      if (btnTruth) btnTruth.disabled = true;
      if (btnLie) btnLie.disabled = true;
    } else if (data.phase === 'REVEALED') {
      if (btnTruth) btnTruth.disabled = true;
      if (btnLie) btnLie.disabled = true;

      // Personalized Reveal Check!
      if (data.correctAnswer && personalRevealCard) {
        if (!myVote) {
          personalRevealCard.className = 'personal-reveal-card incorrect';
          personalRevealIcon.textContent = '⏰';
          personalRevealTitle.textContent = 'YOU DIDN\'T VOTE!';
          personalRevealSub.textContent = `The correct answer was ${data.correctAnswer}.`;
        } else if (myVote === data.correctAnswer) {
          personalRevealCard.className = 'personal-reveal-card correct';
          personalRevealIcon.textContent = '🎉';
          personalRevealTitle.textContent = 'YOU WERE RIGHT!';
          personalRevealSub.textContent = `You correctly guessed that this was a ${data.correctAnswer}!`;
        } else {
          personalRevealCard.className = 'personal-reveal-card incorrect';
          personalRevealIcon.textContent = '❌';
          personalRevealTitle.textContent = 'YOU WERE WRONG!';
          personalRevealSub.textContent = `You voted ${myVote}, but it was actually a ${data.correctAnswer}.`;
        }
      }
    } else if (data.phase === 'IDLE') {
      // Round reset
      myVote = null;
      sessionStorage.removeItem('wilty_my_vote');
      if (btnTruth) btnTruth.disabled = true;
      if (btnLie) btnLie.disabled = true;
      if (votedStatusBox) votedStatusBox.classList.remove('active');
      if (personalRevealCard) personalRevealCard.className = 'personal-reveal-card';
    }
  });

  socket.on('connection-count', (count) => {
    const connElem = document.getElementById('audience-connected-count');
    if (connElem) connElem.textContent = `${count} Online`;
  });
}


// ============================================================================
// 3. ADMIN CONSOLE LOGIC
// ============================================================================
function initAdminView() {
  const codePrompt = document.getElementById('admin-code-prompt');
  const codeInput = document.getElementById('admin-code-input');
  const submitCodeBtn = document.getElementById('btn-submit-code');
  const errorMsg = document.getElementById('code-error-msg');

  if (codePrompt) {
    // Wait for socket connection before showing prompt
    setTimeout(() => {
      codePrompt.style.display = 'flex';
    }, 100);

    submitCodeBtn.addEventListener('click', () => {
      const code = codeInput ? codeInput.value.trim() : '';
      if (!code) return;
      socket.emit('verify-admin-code', code);
    });

    if (codeInput) {
      codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          submitCodeBtn.click();
        }
      });
    }

    socket.on('admin-verified', () => {
      codePrompt.style.display = 'none';
    });

    socket.on('admin-code-invalid', () => {
      errorMsg.style.display = 'block';
      if (codeInput) codeInput.value = '';
      codeInput.focus();
      setTimeout(() => {
        errorMsg.style.display = 'none';
      }, 3000);
    });
  }

  const statementInput = document.getElementById('admin-statement-input');
  const speakerInput = document.getElementById('admin-speaker-input');
  const radioTruth = document.getElementById('radio-truth');
  const radioLie = document.getElementById('radio-lie');

  const btnStart = document.getElementById('btn-admin-start');
  const btnLock = document.getElementById('btn-admin-lock');
  const btnReveal = document.getElementById('btn-admin-reveal');
  const btnReset = document.getElementById('btn-admin-reset');

  const livePhaseBadge = document.getElementById('admin-phase-badge');
  const livePhaseDot = document.getElementById('admin-phase-dot');
  const livePhaseText = document.getElementById('admin-phase-text');
  const liveCountElem = document.getElementById('admin-total-votes');
  const liveUsersElem = document.getElementById('admin-connected-users');

  // Preset statement loader
  const presets = [
    { text: "I once got stranded on a deserted island in Scotland for 36 hours.", speaker: "Speaker 1", answer: "TRUTH" },
    { text: "I won a national ballroom dancing competition when I was 14.", speaker: "Speaker 2", answer: "LIE" },
    { text: "I accidentally sent an email meant for my spouse to our entire company of 5,000 employees.", speaker: "Speaker 3", answer: "TRUTH" },
    { text: "I can speak fluent Esperanto and read ancient Greek.", speaker: "Speaker 4", answer: "LIE" }
  ];

  const presetContainer = document.getElementById('admin-preset-list');
  if (presetContainer) {
    presets.forEach(p => {
      const item = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `
        <span class="preset-text">${p.speaker}: ${p.text}</span>
        <span class="preset-tag ${p.answer}">${p.answer}</span>
      `;
      item.addEventListener('click', () => {
        if (statementInput) statementInput.value = p.text;
        if (speakerInput) speakerInput.value = p.speaker;
        if (p.answer === 'TRUTH' && radioTruth) radioTruth.checked = true;
        if (p.answer === 'LIE' && radioLie) radioLie.checked = true;
      });
      presetContainer.appendChild(item);
    });
  }

  // Admin button listeners
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      const statement = statementInput ? statementInput.value.trim() : '';
      const speaker = speakerInput ? speakerInput.value.trim() : 'Presenter';
      const correctAnswer = radioTruth && radioTruth.checked ? 'TRUTH' : 'LIE';

      if (!statement) {
        alert('Please enter or select a statement first.');
        return;
      }

      socket.emit('admin-start-voting', {
        statement,
        speaker,
        correctAnswer
      });
    });
  }

  if (btnLock) {
    btnLock.addEventListener('click', () => {
      socket.emit('admin-lock-voting');
    });
  }

  if (btnReveal) {
    btnReveal.addEventListener('click', () => {
      socket.emit('admin-reveal-answer');
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Reset poll state for next statement?')) {
        socket.emit('admin-reset');
      }
    });
  }

  // State update sync on Admin console
  socket.on('state-update', (data) => {
    updateStatusBadge(livePhaseDot, livePhaseText, data.phase);

    if (liveCountElem) {
      const { truth, lie, total } = data.tallies || { truth: 0, lie: 0, total: 0 };
      liveCountElem.textContent = `${total} votes (${truth} Truth / ${lie} Lie)`;
    }

    if (data.activeConnections !== undefined && liveUsersElem) {
      liveUsersElem.textContent = `${data.activeConnections} Connected`;
    }
  });

  socket.on('connection-count', (count) => {
    if (liveUsersElem) liveUsersElem.textContent = `${count} Connected`;
  });
}


// Helper for status badge updating
function updateStatusBadge(dotElem, textElem, phase) {
  if (!dotElem || !textElem) return;

  dotElem.className = 'pulse-dot';
  if (phase === 'VOTING') {
    dotElem.classList.add('voting');
    textElem.textContent = 'VOTING OPEN';
  } else if (phase === 'LOCKED') {
    dotElem.classList.add('locked');
    textElem.textContent = 'VOTING LOCKED';
  } else if (phase === 'REVEALED') {
    dotElem.classList.add('voting');
    textElem.textContent = 'ANSWER REVEALED';
  } else {
    textElem.textContent = 'WAITING FOR START';
  }
}
