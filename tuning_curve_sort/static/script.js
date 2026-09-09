const SVG_NS = 'http://www.w3.org/2000/svg';
// The curve itself lives above AXIS_Y; images (both placed and the current
// round's blanks) live in a single row below the x-axis, not on the curve
// line -- otherwise crowded/nudged boxes stop lining up with the curve they
// represent. AXIS_Y is the boundary between the two.
const MARGIN = { left: 50, right: 20, top: 20, bottom: 90 };
const VB_W = 480;
const VB_H = 380;
const PLOT_W = VB_W - MARGIN.left - MARGIN.right;
const PLOT_H = VB_H - MARGIN.top - MARGIN.bottom;
const AXIS_Y = MARGIN.top + PLOT_H;
const POINT_SIZE = 22;
const ROW_GAP = 14;
const ROW_Y = AXIS_Y + ROW_GAP + POINT_SIZE / 2;

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
        x1: MARGIN.left, y1: MARGIN.top, x2: MARGIN.left, y2: AXIS_Y,
        class: 'axis-line'
    }));
    svgEl.appendChild(makeEl('line', {
        x1: MARGIN.left, y1: AXIS_Y, x2: MARGIN.left + PLOT_W, y2: AXIS_Y,
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

    // Dashed reference curve, drawn through everything's TRUE x/y (never the
    // nudged row position below), so it always reflects the real shape.
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

    // Placed thumbnails and the current round's blank slots all live in one
    // row below the x-axis instead of directly on the curve -- otherwise,
    // once several of them need nudging apart for legibility (common at the
    // crowded low-activation end now that every real image is a candidate
    // point), they stop lining up with the curve line itself. Their row
    // x position is nudged only for spacing; a connector line for the
    // current (dotted) ones shows where they'd truly sit on the curve.
    //
    // The row has a fixed pixel budget, but placed images accumulate without
    // bound over a playthrough, so only the most recently placed ones are
    // shown (recent = nearest the active frontier, which is what matters);
    // older ones are summarized with a "+N earlier" label instead of being
    // squeezed or silently clipped.
    const half = POINT_SIZE / 2;
    const minGap = POINT_SIZE + 3;
    const currentCount = state.current ? state.current.slots.length : 0;
    const maxPlacedShown = Math.max(0, Math.floor(PLOT_W / minGap) - currentCount);
    const hiddenPlacedCount = Math.max(0, state.placed.length - maxPlacedShown);
    const visiblePlaced = state.placed.slice(hiddenPlacedCount);

    const rowItems = [
        ...visiblePlaced.map(p => ({ ...p, kind: 'placed' })),
        ...(state.current ? state.current.slots.map(s => ({ ...s, kind: 'slot' })) : []),
    ].sort((a, b) => a.x - b.x);

    let prevPx = MARGIN.left - minGap;
    if (hiddenPlacedCount > 0) {
        svgEl.appendChild(makeEl('text', {
            x: MARGIN.left, y: ROW_Y + 4, class: 'row-overflow-label'
        })).textContent = `+${hiddenPlacedCount} earlier`;
        prevPx = MARGIN.left + 58;
    }
    rowItems.forEach(item => {
        let px = svgX(item.x);
        if (px < prevPx + minGap) px = prevPx + minGap;
        item.px = px;
        prevPx = px;
    });

    rowItems.forEach(item => {
        if (item.kind === 'slot') {
            svgEl.appendChild(makeEl('line', {
                x1: item.px, y1: ROW_Y - half,
                x2: svgX(item.x), y2: svgY(item.y),
                class: 'connector-line'
            }));
        }
    });

    rowItems.forEach(item => {
        if (item.kind === 'slot') {
            svgEl.appendChild(makeEl('rect', {
                x: item.px - half, y: ROW_Y - half,
                width: POINT_SIZE, height: POINT_SIZE, rx: 4,
                class: 'slot-rect', 'data-slot-id': item.id
            }));
        } else {
            const img = makeEl('image', {
                x: item.px - half, y: ROW_Y - half,
                width: POINT_SIZE, height: POINT_SIZE
            });
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', item.img_path);
            svgEl.appendChild(img);
            svgEl.appendChild(makeEl('rect', {
                x: item.px - half, y: ROW_Y - half,
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
