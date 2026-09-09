const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = { left: 50, right: 20, top: 20, bottom: 40 };
const VB_W = 480;
const VB_H = 340;
const PLOT_W = VB_W - MARGIN.left - MARGIN.right;
const PLOT_H = VB_H - MARGIN.top - MARGIN.bottom;
const POINT_SIZE = 22;

const neuronPicker = document.getElementById('neuron-picker');
const svgEl = document.getElementById('curve-svg');
const grid = document.getElementById('options-grid');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const feedbackEl = document.getElementById('feedback');
const roundInfoEl = document.getElementById('round-info');

let neuronId = neuronPicker ? neuronPicker.value : '';
let currentOrder = [];
let lastFeedback = null;

function svgX(xNorm) {
    return MARGIN.left + xNorm * PLOT_W;
}

function svgY(yNorm) {
    return MARGIN.top + (1 - yNorm) * PLOT_H;
}

function makeEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, value);
    }
    return node;
}

// ==========================================
// TUNING CURVE RENDERING
// ==========================================

function renderCurve(state) {
    svgEl.innerHTML = '';

    svgEl.appendChild(makeEl('line', {
        x1: MARGIN.left, y1: MARGIN.top, x2: MARGIN.left, y2: MARGIN.top + PLOT_H,
        class: 'axis-line'
    }));
    svgEl.appendChild(makeEl('line', {
        x1: MARGIN.left, y1: MARGIN.top + PLOT_H, x2: MARGIN.left + PLOT_W, y2: MARGIN.top + PLOT_H,
        class: 'axis-line'
    }));

    const yLabel = makeEl('text', {
        x: 14, y: MARGIN.top + PLOT_H / 2, class: 'axis-label', 'text-anchor': 'middle',
        transform: `rotate(-90 14 ${MARGIN.top + PLOT_H / 2})`
    });
    yLabel.textContent = `Neuron ${state.neuron_number} firing rate`;
    svgEl.appendChild(yLabel);

    const xLabel = makeEl('text', {
        x: MARGIN.left + PLOT_W / 2, y: VB_H - 8, class: 'axis-label', 'text-anchor': 'middle'
    });
    xLabel.textContent = `Feature neuron ${state.neuron_number} responds to`;
    svgEl.appendChild(xLabel);

    const referencePoints = [...state.background];
    state.placed.forEach(p => referencePoints.push({ x: p.x, y: p.y }));
    if (state.current) state.current.slots.forEach(s => referencePoints.push({ x: s.x, y: s.y }));
    referencePoints.sort((a, b) => a.x - b.x);

    if (referencePoints.length > 1) {
        const d = referencePoints
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${svgX(p.x)} ${svgY(p.y)}`)
            .join(' ');
        svgEl.appendChild(makeEl('path', { d, class: 'curve-path' }));
    }

    state.background.forEach(p => {
        svgEl.appendChild(makeEl('circle', { cx: svgX(p.x), cy: svgY(p.y), r: 3, class: 'bg-dot' }));
    });

    // Placed thumbnails and the current round's blank slots are real boxes
    // (unlike the plain background dots), so when several of them land within
    // a few pixels of each other -- common at the crowded low-activation end
    // now that every real image is a candidate point -- nudge them apart
    // left-to-right just for display. Their true x/y (and the dashed
    // reference curve above) are untouched.
    const boxItems = [
        ...state.placed.map(p => ({ ...p, kind: 'placed' })),
        ...(state.current ? state.current.slots.map(s => ({ ...s, kind: 'slot' })) : []),
    ].sort((a, b) => a.x - b.x);

    const half = POINT_SIZE / 2;
    const minGap = POINT_SIZE + 3;
    let prevPx = -Infinity;
    boxItems.forEach(item => {
        let px = svgX(item.x);
        if (px - prevPx < minGap) px = prevPx + minGap;
        item.px = px;
        prevPx = px;
    });

    boxItems.forEach(item => {
        const py = svgY(item.y);
        if (item.kind === 'slot') {
            svgEl.appendChild(makeEl('rect', {
                x: item.px - half, y: py - half,
                width: POINT_SIZE, height: POINT_SIZE, rx: 4,
                class: 'slot-rect', 'data-slot-id': item.id
            }));
        } else {
            const img = makeEl('image', {
                x: item.px - half, y: py - half,
                width: POINT_SIZE, height: POINT_SIZE
            });
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', item.img_path);
            svgEl.appendChild(img);
            svgEl.appendChild(makeEl('rect', {
                x: item.px - half, y: py - half,
                width: POINT_SIZE, height: POINT_SIZE, rx: 3,
                class: 'placed-frame'
            }));
        }
    });
}

// ==========================================
// OPTIONS GRID (CLICK-TO-SWAP)
// ==========================================

function renderOptions() {
    grid.innerHTML = '';
    currentOrder.forEach((item, idx) => {
        const tile = document.createElement('div');
        tile.className = 'option-tile';
        tile.dataset.id = item.id;

        if (lastFeedback && lastFeedback[idx] !== undefined) {
            tile.classList.add(lastFeedback[idx] ? 'correct-pos' : 'wrong-pos');
        }

        tile.innerHTML = `<img src="${item.img_path}" alt="sort me" />`;
        tile.onclick = () => handleTileClick(idx);
        grid.appendChild(tile);
    });
}

function handleTileClick(idx) {
    const total = currentOrder.length;
    const targetIdx = (idx + 1) % total;
    [currentOrder[idx], currentOrder[targetIdx]] = [currentOrder[targetIdx], currentOrder[idx]];
    lastFeedback = null;
    renderOptions();
}

// ==========================================
// FLY-TO-CURVE ANIMATION
// ==========================================

function flyTilesToCurve() {
    return new Promise((resolve) => {
        const tiles = [...grid.querySelectorAll('.option-tile')];
        const clones = [];

        tiles.forEach(tile => {
            const id = tile.dataset.id;
            const slot = svgEl.querySelector(`rect.slot-rect[data-slot-id="${id}"]`);
            const img = tile.querySelector('img');
            if (!slot || !img) return;

            const startRect = img.getBoundingClientRect();
            const endRect = slot.getBoundingClientRect();

            const clone = img.cloneNode(true);
            clone.className = 'fly-clone';
            clone.style.left = `${startRect.left}px`;
            clone.style.top = `${startRect.top}px`;
            clone.style.width = `${startRect.width}px`;
            clone.style.height = `${startRect.height}px`;
            document.body.appendChild(clone);
            clones.push(clone);

            tile.style.visibility = 'hidden';

            requestAnimationFrame(() => {
                clone.style.left = `${endRect.left}px`;
                clone.style.top = `${endRect.top}px`;
                clone.style.width = `${endRect.width}px`;
                clone.style.height = `${endRect.height}px`;
            });
        });

        setTimeout(() => {
            clones.forEach(c => c.remove());
            pulseCurvePanel();
            resolve();
        }, 650);
    });
}

function pulseCurvePanel() {
    const panel = document.querySelector('.curve-panel');
    panel.classList.add('expand-pulse');
    setTimeout(() => panel.classList.remove('expand-pulse'), 350);
}

// ==========================================
// GAME STATE / API
// ==========================================

async function loadState() {
    const res = await fetch(`/api/state?neuron=${encodeURIComponent(neuronId)}`);
    if (!res.ok) {
        feedbackEl.textContent = 'Failed to load neuron data.';
        return;
    }
    const state = await res.json();
    lastFeedback = null;
    renderCurve(state);

    if (state.done) {
        grid.innerHTML = '<div class="done-banner">Full tuning curve mapped for this neuron!</div>';
        if (submitBtn) submitBtn.classList.add('hidden');
        roundInfoEl.textContent = '';
        return;
    }

    if (submitBtn) submitBtn.classList.remove('hidden');
    currentOrder = state.current.images;
    renderOptions();
    roundInfoEl.textContent = `${state.placed_count} of ${state.pool_size} images placed`;
    feedbackEl.textContent = 'Sort these three images from lowest to highest activation, left to right.';
    feedbackEl.className = 'feedback-msg';
}

async function handleSubmit() {
    const order = currentOrder.map(item => item.id);
    const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neuron: neuronId, order })
    });
    const result = await res.json();
    lastFeedback = result.positions_correct;

    if (result.correct) {
        feedbackEl.textContent = 'Correct! Locking them into the curve...';
        feedbackEl.className = 'feedback-msg correct';
        await flyTilesToCurve();
        await loadState();
    } else {
        feedbackEl.textContent = 'Not quite: green border = correct spot, red = wrong spot. Keep swapping.';
        feedbackEl.className = 'feedback-msg incorrect';
        renderOptions();
    }
}

if (submitBtn) submitBtn.onclick = handleSubmit;

if (resetBtn) {
    resetBtn.onclick = async () => {
        await fetch('/api/reset', { method: 'POST' });
        await loadState();
    };
}

if (neuronPicker) {
    neuronPicker.onchange = (e) => {
        neuronId = e.target.value;
        loadState();
    };
}

loadState();
