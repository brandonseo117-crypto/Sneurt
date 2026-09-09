"""
Tuning-curve sorting game.

Standalone Flask app that sits next to the main Sneurt app and reads the
same image folders (static/imagesforsorting/...) read-only. It does not
import or modify anything from engine.py / static/script.js.

Run with:
    cd tuning_curve_sort
    python app.py
Then open http://127.0.0.1:5050
"""

import math
import random
import re
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory, session

APP_DIR = Path(__file__).resolve().parent
IMAGES_ROOT = APP_DIR.parent / "static" / "imagesforsorting"

app = Flask(__name__)
app.secret_key = "tuning-curve-sort-dev-key"

ROUND_SIZE = 3          # images to sort per round
MAX_ANCHORS = 15         # how many real images make up the full tuning curve
BACKGROUND_POINTS = 40   # roughly how many decorative dots to draw

IMAGE_INDEX_RE = re.compile(r"(\d+)")


def neuron_folders():
    return sorted(p.name for p in IMAGES_ROOT.iterdir() if p.is_dir())


def is_valid_neuron(neuron_id):
    return bool(neuron_id) and (IMAGES_ROOT / neuron_id).is_dir()


def image_rank(path: Path) -> int:
    match = IMAGE_INDEX_RE.search(path.stem)
    return int(match.group(1)) if match else 0


def load_neuron_files(neuron_id):
    folder = IMAGES_ROOT / neuron_id
    return sorted(folder.glob("*.jpg"), key=image_rank)


def activation_proxy(x_fraction: float) -> float:
    """
    Placeholder tuning-curve shape (a sigmoid over image rank), used until
    per-image activation values from the real numpy arrays are wired in.
    Swap the body of this function out for a lookup into that array later --
    everything else only assumes the result increases monotonically with
    x_fraction, in [0, 1].
    """
    return 1 / (1 + math.exp(-8 * (x_fraction - 0.5)))


def to_image_url(path: Path) -> str:
    return f"/neuron_images/{path.parent.name}/{path.name}"


def build_curve(neuron_id):
    if not is_valid_neuron(neuron_id):
        return None

    files = load_neuron_files(neuron_id)
    n = len(files)
    if n == 0:
        return None

    anchor_count = min(MAX_ANCHORS, n)
    if anchor_count > 1:
        anchor_positions = sorted(set(
            round(i * (n - 1) / (anchor_count - 1)) for i in range(anchor_count)
        ))
    else:
        anchor_positions = [0]

    denom = max(len(anchor_positions) - 1, 1)
    anchors = []
    for rank, file_idx in enumerate(anchor_positions):
        x = rank / denom
        anchors.append({
            "id": f"{neuron_id}:{file_idx}",
            "img_path": to_image_url(files[file_idx]),
            "x": round(x, 4),
            "y": round(activation_proxy(x), 4),
        })

    stride = max(1, n // BACKGROUND_POINTS)
    anchor_idx_set = set(anchor_positions)
    background = []
    for i in range(0, n, stride):
        if i in anchor_idx_set:
            continue
        x = i / (n - 1) if n > 1 else 0
        background.append({"x": round(x, 4), "y": round(activation_proxy(x), 4)})

    return {"anchors": anchors, "background": background}


def get_state(neuron_id):
    state = session.get("game")
    if not state or state.get("neuron_id") != neuron_id:
        state = {"neuron_id": neuron_id, "round_index": 0, "placed_anchor_ids": []}
        session["game"] = state
    return state


def save_state(state):
    session["game"] = state


def current_round_anchors(anchors, round_index):
    start = round_index * ROUND_SIZE
    return anchors[start:start + ROUND_SIZE]


@app.route("/")
def home():
    neurons = neuron_folders()
    default_neuron = neurons[0] if neurons else None
    return render_template("index.html", neurons=neurons, default_neuron=default_neuron)


@app.route("/neuron_images/<neuron_id>/<path:filename>")
def neuron_image(neuron_id, filename):
    if not is_valid_neuron(neuron_id):
        return "", 404
    return send_from_directory(IMAGES_ROOT / neuron_id, filename)


@app.route("/api/state")
def api_state():
    neuron_id = request.args.get("neuron", "")
    curve = build_curve(neuron_id)
    if curve is None:
        return jsonify({"error": "unknown neuron"}), 404

    state = get_state(neuron_id)
    anchors = curve["anchors"]
    total_rounds = max(1, -(-len(anchors) // ROUND_SIZE))

    placed_ids = set(state["placed_anchor_ids"])
    current_ids_in_play = set()

    round_index = state["round_index"]
    round_anchors = current_round_anchors(anchors, round_index)
    done = len(round_anchors) == 0

    current = None
    if not done:
        current_ids_in_play = {a["id"] for a in round_anchors}
        shuffled = round_anchors[:]
        random.shuffle(shuffled)
        current = {
            "round_index": round_index,
            "total_rounds": total_rounds,
            "slots": [{"id": a["id"], "x": a["x"], "y": a["y"]} for a in round_anchors],
            "images": [{"id": a["id"], "img_path": a["img_path"]} for a in shuffled],
        }

    placed = [a for a in anchors if a["id"] in placed_ids]
    pending_dots = [
        {"x": a["x"], "y": a["y"]}
        for a in anchors
        if a["id"] not in placed_ids and a["id"] not in current_ids_in_play
    ]

    neuron_number_match = re.search(r"neuron(\d+)", neuron_id)
    neuron_number = neuron_number_match.group(1) if neuron_number_match else "?"

    return jsonify({
        "neuron_id": neuron_id,
        "neurons": neuron_folders(),
        "neuron_number": neuron_number,
        "background": curve["background"] + pending_dots,
        "placed": placed,
        "current": current,
        "done": done,
    })


@app.route("/api/submit", methods=["POST"])
def api_submit():
    data = request.get_json(silent=True) or {}
    neuron_id = data.get("neuron", "")
    order = data.get("order", [])

    curve = build_curve(neuron_id)
    if curve is None:
        return jsonify({"error": "unknown neuron"}), 404

    state = get_state(neuron_id)
    anchors = curve["anchors"]
    round_anchors = current_round_anchors(anchors, state["round_index"])

    if not round_anchors:
        return jsonify({"error": "no active round"}), 400

    correct_order = [a["id"] for a in round_anchors]
    positions_correct = [
        i < len(order) and order[i] == correct_order[i]
        for i in range(len(correct_order))
    ]
    is_correct = len(order) == len(correct_order) and all(positions_correct)

    if is_correct:
        state["placed_anchor_ids"].extend(correct_order)
        state["round_index"] += 1
        save_state(state)

    return jsonify({
        "correct": is_correct,
        "positions_correct": positions_correct,
    })


@app.route("/api/reset", methods=["POST"])
def api_reset():
    session.pop("game", None)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5050)
