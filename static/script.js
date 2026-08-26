const howToPlayModal = document.getElementById('how-to-play-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const gotItBtn = document.getElementById('got-it-btn');

async function getImages() {
    const url = '/api/images'
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        const result = await response.json()
        console.log(result)
    }   
    catch (error) {
        console.error(error.message);
    };
}

function openHowToPlayModal() {
    if (howToPlayModal) {
        howToPlayModal.classList.remove('hidden');
    }
}

function closeHowToPlayModal() {
    if (howToPlayModal) {
        howToPlayModal.classList.add('hidden');
    }
}

// Event Listeners
if (closeModalBtn) closeModalBtn.addEventListener('click', closeHowToPlayModal);
if (gotItBtn) gotItBtn.addEventListener('click', closeHowToPlayModal);

// Close on backdrop click
if (howToPlayModal) {
    howToPlayModal.addEventListener('click', (e) => {
        if (e.target === howToPlayModal) {
            closeHowToPlayModal();
        }
    });
}

// Trigger initial fade-in smoothly when DOM loads
window.addEventListener('DOMContentLoaded', () => {
    // Brief frame delay ensures initial render registers before transition begins
    requestAnimationFrame(() => {
        openHowToPlayModal();
    });
});

// Sample Data: 8 items with true relative activation values (0 to 100)
function createDataset(neuronnum, totalItems, stepN) {
    const dataset = []
    for (let i =0; i<totalItems; i++){
        const ImageNumber = i * stepN;
        const paddedImg = String(ImageNumber).padStart(4, '0');
        const imagePath = `../sneurt/imagesforsorting/images_190923_neuron${neuronnum}/image${paddedImg}.jpg`;
        const item = {
            id: i,
            val: totalItems - i,
            img: imagePath
        };
        dataset.push(item);
    };
    return dataset;
};

const DATA_SET = createDataset(Math.floor(Math.random() * 32), 6, 5);

// Helper function: Fisher-Yates Shuffle
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

let newlyPlacedIndex = null;
let gameMode = null;
let activeDirection = null; // Stores "ASC" or "DESC" once established
let newlyAddedDropIndices = []; // Stores both new drop box indices
let lockedIds = new Set();
let newlyLockedIds = new Set();
let correctTileIds = new Set(); 
let oneAwayTileIds = new Set(); // Stores tiles that are 1 spot away from target
let targetScrollLeft = 0;
let isAnimating = false;
let pool = [];
let boardState = [];
let currentItem = null;
let phase = "PLACEMENT"; // PLACEMENT, SORTING, COMPLETE
let draggedIndex = null; 
let checkedCorrectness = false; 
let isSwapAnimating = false; 

// Score & Streak Tracking
let currentScore = 0;
let currentStreak = 0;

// DOM Elements
const restartBtn = document.getElementById('restart-btn');
const stageArea = document.getElementById('stage-area');
const currentImgEl = document.getElementById('current-img');
const boardEl = document.getElementById('board');
const submitBtn = document.getElementById('submit-btn');
const feedbackEl = document.getElementById('feedback');
const scoreDisplayEl = document.getElementById('score-display');
const sortingPhase = document.querySelector('.sorting-phase');
const boardContainer = document.querySelector('.board-container') || boardEl;
const modeSelectScreen = document.getElementById('mode-select-screen');
const fullModeBtn = document.getElementById('full-mode-btn');
const directSortBtn = document.getElementById('direct-sort-btn');

fullModeBtn.addEventListener('click', () => startGame("FULL"));
directSortBtn.addEventListener('click', () => startGame("DIRECT_SORT"));

// ==========================================
// UI & TOAST NOTIFICATIONS
// ==========================================

function updateScoreUI() {
    if (scoreDisplayEl) scoreDisplayEl.innerText = `Score: ${Math.max(0, currentScore)}`;
}

function showToast(message, isSpecial = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    
    let toastClass = 'score-toast';
    if (message.includes('Streak')) {
        toastClass += ' streak';
    } else if (isSpecial) {
        toastClass += ' gold';
    }

    toast.className = toastClass;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 1600);
}

function renderStageCard() {
    if (currentItem && currentImgEl) {
        currentImgEl.src = currentItem.img;
        currentImgEl.style.opacity = '1';
    }
}

// ==========================================
// GAME INITIALIZATION & FLOW
// ==========================================

function initGame() {
    activeDirection = null;
    currentScore = 0;
    currentStreak = 0;
    correctTileIds.clear();
    oneAwayTileIds.clear();
    lockedIds.clear();
    newlyLockedIds.clear();
    checkedCorrectness = false;
    
    updateScoreUI();

    // Reset visual transforms on sorting phase & stage area
    if (sortingPhase) sortingPhase.classList.remove('sort-float-up');
    if (stageArea) stageArea.classList.remove('hidden-stage');

    // Show mode screen, hide gameplay elements initially
    modeSelectScreen.classList.remove('hidden');
    stageArea.classList.add('hidden');
    boardContainer.classList.add('hidden');
    submitBtn.classList.add('hidden');
    if (restartBtn) restartBtn.classList.add('hidden');
    feedbackEl.innerText = "";
}

function startGame(selectedMode) {
    gameMode = selectedMode;
    modeSelectScreen.classList.add('hidden');

    if (gameMode === "FULL") {
        // Standard placement setup
        phase = "PLACEMENT";
        pool = shuffle([...DATA_SET]);
        boardState = [pool.pop()];
        currentItem = pool.pop();
        
        stageArea.classList.remove('hidden');
        boardContainer.classList.remove('hidden');
        renderStageCard();
        renderBoard();
    } else {
        // Direct Sort: Shuffle all cards into the board state immediately
        phase = "SORTING";
        boardState = shuffle([...DATA_SET]);
        pool = [];
        currentItem = null;

        stageArea.classList.add('hidden'); // Hide placement stage
        boardContainer.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        
        feedbackEl.innerText = "Click or drag tiles to arrange them in order, then click Submit!";
        renderBoard();
    }
}

function nextPlacementTurn() {
    if (pool.length > 0) {
        currentItem = pool.pop();
        renderStageCard();
        renderBoard();
    }
}

function placeCurrentItem(index) {
    boardState.splice(index, 0, currentItem);
    currentItem = null;

    newlyPlacedIndex = index;
    newlyAddedDropIndices = [index, index + 1];

    if (pool.length > 0) {
        nextPlacementTurn();
    } else {
        if (currentImgEl) {
            currentImgEl.src = ""; 
            currentImgEl.style.opacity = '0';
        }
        renderBoard();
        if (stageArea) stageArea.classList.add('hidden-stage');
        if (sortingPhase) sortingPhase.classList.add('sort-float-up');
        phase = 'SORTING';
        collapseBoardAndCheck();
    }
}

function collapseBoardAndCheck() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const dropSlots = boardEl.querySelectorAll('.drop-slot');
            dropSlots.forEach(slot => slot.classList.add('collapsed'));

            const dropZones = boardEl.querySelectorAll('.drop-zone');
            dropZones.forEach(zone => zone.classList.add('collapsed'));
        });
    });

    setTimeout(() => {
        phase = "SORTING";
        evaluateBoard(); 
    }, 1000); 
}

function isTileLocked(index) {
    if (!boardState[index]) return false;
    const item = boardState[index];
    return lockedIds.has(item.id) || correctTileIds.has(item.id);
}

// ==========================================
// CLICK-TO-SWAP & DRAG LOGIC (PHASE 2)
// ==========================================

function animateAndSwap(clickedIndex, targetIndex) {
    isSwapAnimating = true;
    const slots = boardEl.children;
    const clickedSlot = slots[clickedIndex];
    const targetSlot = slots[targetIndex];

    const clickedTile = clickedSlot?.querySelector('.tile');
    const targetTile = targetSlot?.querySelector('.tile');

    if (!clickedTile || !targetTile) {
        swapItems(clickedIndex, targetIndex);
        renderBoard();
        isSwapAnimating = false;
        return;
    }

    const clickedRect = clickedTile.getBoundingClientRect();
    const targetRect = targetTile.getBoundingClientRect();

    const deltaXForClicked = targetRect.left - clickedRect.left;
    const deltaXForTarget = clickedRect.left - targetRect.left;

    clickedTile.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
    targetTile.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
    clickedTile.style.zIndex = '10';
    targetTile.style.zIndex = '5';

    requestAnimationFrame(() => {
        clickedTile.style.transform = `translateX(${deltaXForClicked}px)`;
        targetTile.style.transform = `translateX(${deltaXForTarget}px)`;
    });

    setTimeout(() => {
        clickedTile.style.transform = '';
        clickedTile.style.transition = '';
        targetTile.style.transform = '';
        targetTile.style.transition = '';

        swapItems(clickedIndex, targetIndex);

        checkedCorrectness = false; 
        feedbackEl.innerText = "";
        renderBoard();
        isSwapAnimating = false;
    }, 250); 
}

function handleTileClickToSwap(clickedIndex) {
    if (phase !== "SORTING" || isSwapAnimating) return;
    if (isTileLocked(clickedIndex)) return;

    const totalTiles = boardState.length;
    if (totalTiles <= 1) return;

    let targetIndex = (clickedIndex + 1) % totalTiles;

    let checkedCount = 0;
    while (isTileLocked(targetIndex) && checkedCount < totalTiles) {
        targetIndex = (targetIndex + 1) % totalTiles;
        checkedCount++;
    }

    if (targetIndex === clickedIndex || isTileLocked(targetIndex)) return;

    animateAndSwap(clickedIndex, targetIndex);
}

function swapItems(fromIdx, toIdx) {
    const temp = boardState[fromIdx];
    boardState[fromIdx] = boardState[toIdx];
    boardState[toIdx] = temp;
}

if (currentImgEl) {
    currentImgEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'stage-card');
    });
}

function setupTileDragAndDrop(targetEl, index) {
    if (phase === "PLACEMENT") {
        targetEl.addEventListener('dragover', (e) => e.preventDefault());
        targetEl.addEventListener('dragenter', () => targetEl.classList.add('drag-over'));
        targetEl.addEventListener('dragleave', () => targetEl.classList.remove('drag-over'));
        targetEl.addEventListener('drop', (e) => {
            e.preventDefault();
            targetEl.classList.remove('drag-over');
            placeCurrentItem(index);
        });
    } else if (phase === "SORTING") {
        if (isTileLocked(index)) return;

        targetEl.draggable = true;

        targetEl.addEventListener('dragstart', (e) => {
            if (isSwapAnimating) return;
            draggedIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
            setTimeout(() => targetEl.style.opacity = '0.5', 0);
        });

        targetEl.addEventListener('dragend', () => {
            targetEl.style.opacity = '1';
            draggedIndex = null;
        });

        targetEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        targetEl.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (draggedIndex !== index && !isTileLocked(index)) {
                targetEl.classList.add('drag-over');
            }
        });

        targetEl.addEventListener('dragleave', () => {
            targetEl.classList.remove('drag-over');
        });

        targetEl.addEventListener('drop', (e) => {
            e.preventDefault();
            targetEl.classList.remove('drag-over');
            
            if (draggedIndex !== null && draggedIndex !== index && !isTileLocked(index)) {
                swapItems(draggedIndex, index);

                checkedCorrectness = false;
                feedbackEl.innerText = "";
                renderBoard();
            }
        });
    }
}

// ==========================================
// EVALUATION
// ==========================================

// ==========================================
// EVALUATION & SYNAPTIC ASSIST
// ==========================================

function evaluateBoard() {
    checkedCorrectness = true;
    newlyLockedIds.clear(); 
    oneAwayTileIds.clear(); // Reset 1-away highlights

    const ascOrder = [...boardState].sort((a, b) => a.val - b.val);
    const descOrder = [...boardState].sort((a, b) => b.val - a.val);

    // 1. Lock active direction on first evaluation (ignoring middle tile)
    if (!activeDirection) {
        const middleIndex = Math.floor(boardState.length / 2);
        let ascMatches = 0;
        let descMatches = 0;

        boardState.forEach((item, i) => {
            if (i === middleIndex) return;

            if (item.id === ascOrder[i].id) ascMatches++;
            if (item.id === descOrder[i].id) descMatches++;
        });

        activeDirection = (descMatches > ascMatches) ? "DESC" : "ASC";

        const directionLabel = activeDirection === "DESC" ? "High → Low" : "Low → High";
        showToast(`🧭 Direction Locked: ${directionLabel}`, true);
    }

    // 2. Target order based on locked direction
    const correctOrder = (activeDirection === "DESC") ? descOrder : ascOrder;

    let wrongCount = 0;
    let newlyFoundCorrect = 0;

    // 3. First Pass: Lock exact matches & track wrong tiles
    boardState.forEach((item, i) => {
        const targetIndex = correctOrder.findIndex(target => target.id === item.id);

        if (targetIndex === i) {
            // EXACT MATCH (GREEN / LOCKED)
            if (!correctTileIds.has(item.id)) {
                currentScore += 100;
                newlyFoundCorrect++;
                currentStreak++;

                if (currentStreak > 1) {
                    currentScore += 150;
                    showToast(`🔥 ${currentStreak} Streak! +150 Bonus!`, true);
                }
            }

            correctTileIds.add(item.id);

            if (!lockedIds.has(item.id)) {
                newlyLockedIds.add(item.id);
            }
            lockedIds.add(item.id);
        } else {
            // INCORRECT TILE
            lockedIds.delete(item.id);
            correctTileIds.delete(item.id);
            wrongCount++;
            currentStreak = 0;
        }
    });

    updateScoreUI();

    if (newlyFoundCorrect > 0) {
        showToast(`+${newlyFoundCorrect * 100} Correct Match!`);
    }

    // WIN STATE
    if (wrongCount === 0) {
        currentScore += 1000;
        updateScoreUI();

        showToast(`+1000 Puzzle Solved! 🎉`, true);
        feedbackEl.innerText = `🎉 Perfect! All images are correctly ordered! Final Score: ${currentScore}`;
        
        submitBtn.classList.add('hidden');
        if (restartBtn) restartBtn.classList.remove('hidden');
        
        phase = "COMPLETE";
        renderBoard();
        return;
    }

    submitBtn.classList.remove('hidden');

    // 4. CHECK CONDITIONS IN ORDER:
    // If wrongCount > 6, execute Synaptic Assist FIRST before rendering or applying yellow highlights
    if (wrongCount > 6) {
        const autoFixCount = 2;
        const dirText = activeDirection === "DESC" ? "High to Low" : "Low to High";
        feedbackEl.innerText = `⚡ Synaptic Assist activated (${dirText})! Helping out with ${autoFixCount} tiles.`;
        
        // Assist will swap tiles and trigger final evaluation & yellow highlight after swapping
        autoCorrectTiles(correctOrder, autoFixCount);
    } else {
        // 5. Apply Yellow Highlights ONLY when all other conditions are satisfied & no assist pending
        boardState.forEach((item, i) => {
            if (!correctTileIds.has(item.id)) {
                const targetIndex = correctOrder.findIndex(target => target.id === item.id);
                if (Math.abs(targetIndex - i) === 1) {
                    oneAwayTileIds.add(item.id);
                }
            }
        });

        const dirText = activeDirection === "DESC" ? "High to Low" : "Low to High";
        feedbackEl.innerText = `Order locked (${dirText}). Click or drag unlocked tiles to swap them.`;
        renderBoard();
    }
}

function autoCorrectTiles(correctOrder, countToFix) {
    let fixed = 0;
    const slots = boardEl.children;

    let wrongIndices = boardState
        .map((item, idx) => (item.id !== correctOrder[idx].id ? idx : null))
        .filter(idx => idx !== null);

    wrongIndices.sort(() => Math.random() - 0.5);

    for (let i = 0; i < wrongIndices.length; i++) {
        const targetSlot = wrongIndices[i];
        const correctItem = correctOrder[targetSlot];
        
        const currentItemIndex = boardState.findIndex(item => item.id === correctItem.id);
        const displacedItem = boardState[targetSlot];

        const partnerWouldBeCorrect = (displacedItem.id === correctOrder[currentItemIndex].id);

        if (partnerWouldBeCorrect) {
            continue; 
        }

        const tileA = slots[targetSlot]?.querySelector('.tile');
        const tileB = slots[currentItemIndex]?.querySelector('.tile');

        if (tileA) tileA.classList.add('swapping');
        if (tileB) tileB.classList.add('swapping');

        swapItems(targetSlot, currentItemIndex);

        lockedIds.add(correctItem.id);
        newlyLockedIds.add(correctItem.id);
        correctTileIds.add(correctItem.id);

        fixed++;
        if (fixed >= countToFix) break;
    }

    setTimeout(() => {
        // Re-calculate yellow highlights AFTER Synaptic Assist finishes swapping
        oneAwayTileIds.clear();
        boardState.forEach((item, i) => {
            if (!correctTileIds.has(item.id)) {
                const targetIndex = correctOrder.findIndex(target => target.id === item.id);
                if (Math.abs(targetIndex - i) === 1) {
                    oneAwayTileIds.add(item.id);
                }
            }
        });

        renderBoard();
    }, 600);
}

// ==========================================
// BOARD RENDERING
// ==========================================

function renderBoard() {
    boardEl.innerHTML = '';

    if (phase === "PLACEMENT") {
        for (let i = 0; i <= boardState.length; i++) {
            // Render Drop Zone
            if (!checkedCorrectness) {
                const dropSlot = document.createElement('div');
                
                const isNewDrop = newlyAddedDropIndices.includes(i);
                dropSlot.className = `slot drop-slot${isNewDrop ? ' expanding' : ''}`;

                const dropZone = document.createElement('div');
                dropZone.className = `drop-zone${isNewDrop ? ' expanding' : ''}`;
                dropZone.innerText = "Drop Here";

                dropZone.onclick = () => placeCurrentItem(i);

                setupTileDragAndDrop(dropZone, i);
                dropSlot.appendChild(dropZone);
                boardEl.appendChild(dropSlot);
            }

            // Render Placed Tile
            if (i < boardState.length) {
                const item = boardState[i];
                const tileSlot = document.createElement('div');
                tileSlot.className = 'slot';

                let tileClasses = `tile`;

                if (i === newlyPlacedIndex) {
                    tileClasses += ' just-placed';
                }

                if (correctTileIds.has(item.id)) {
                    tileClasses += ' correct locked';
                } else if (oneAwayTileIds.has(item.id) && checkedCorrectness) {
                    tileClasses += ' one-away';
                } else if (checkedCorrectness) {
                    tileClasses += ' incorrect';
                }

                tileSlot.innerHTML = `<div class="${tileClasses}"><img src="${item.img}" /></div>`;
                boardEl.appendChild(tileSlot);
            }
        }

        newlyPlacedIndex = null;
        newlyAddedDropIndices = [];
    }
    else { // SORTING or COMPLETE Phase
        boardState.forEach((item, index) => {
            const slot = document.createElement('div');
            slot.className = 'slot';

            const isLocked = isTileLocked(index);
            let tileClasses = `tile`;

            if (phase === 'SORTING' && !isLocked) {
                tileClasses += ' selectable';
            }

            if (isLocked) {
                tileClasses += ' locked';
            }

            if (newlyLockedIds.has(item.id)) {
                tileClasses += ' just-locked';
            }

            if (correctTileIds.has(item.id)) {
                tileClasses += ' correct';
            } else if (oneAwayTileIds.has(item.id) && checkedCorrectness) {
                tileClasses += ' one-away';
            } else if (checkedCorrectness) {
                tileClasses += ' incorrect';
            }

            const tile = document.createElement('div');
            tile.className = tileClasses;
            tile.innerHTML = `<img src="${item.img}" />`;
            
            if (!isLocked && phase === 'SORTING') {
                tile.onclick = () => handleTileClickToSwap(index);
                setupTileDragAndDrop(tile, index);
            }

            slot.appendChild(tile);
            boardEl.appendChild(slot);
        });

        newlyLockedIds.clear();
    }
}

// ==========================================
// SCROLLING & EVENT LISTENERS
// ==========================================

submitBtn.onclick = () => evaluateBoard();

if (restartBtn) {
    restartBtn.onclick = () => initGame();
}

boardContainer.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();

        if (!isAnimating) {
            targetScrollLeft = boardContainer.scrollLeft;
        }

        const scrollDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        targetScrollLeft += scrollDelta * 1.5;

        const maxScroll = boardContainer.scrollWidth - boardContainer.clientWidth;
        targetScrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScroll));

        if (!isAnimating) {
            isAnimating = true;
            requestAnimationFrame(smoothScrollLoop);
        }
    }
}, { passive: false });

function smoothScrollLoop() {
    const diff = targetScrollLeft - boardContainer.scrollLeft;

    if (Math.abs(diff) > 0.5) {
        boardContainer.scrollLeft += diff * 0.2;
        requestAnimationFrame(smoothScrollLoop);
    } else {
        boardContainer.scrollLeft = targetScrollLeft;
        isAnimating = false;
    }
}

// Initialize on page load
initGame();