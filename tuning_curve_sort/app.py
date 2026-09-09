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

ROUND_SIZE = 3   # images to sort per round
LOW_WINDOW = 6   # each round is drawn randomly from this many of the lowest-activation images still left on the curve

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


def build_pool(neuron_id):
    """
    Every image for this neuron, low to high activation (by rank). Each one
    starts out as a plain dot on the curve; sorting rounds are drawn from
    this same pool, low end first.
    """
    if not is_valid_neuron(neuron_id):
        return None

    files = load_neuron_files(neuron_id)
    n = len(files)
    if n == 0:
        return None

    denom = max(n - 1, 1)
    points = []
    for rank, f in enumerate(files):
        x = rank / denom
        points.append({
            "id": f"{neuron_id}:{image_rank(f)}",
            "img_path": to_image_url(f),
            "x": round(x, 4),
            "y": round(activation_proxy(x), 4),
        })
    return points


def get_state(neuron_id):
    state = session.get("game")
    if not state or state.get("neuron_id") != neuron_id:
        state = {"neuron_id": neuron_id, "placed_ids": [], "current_round_ids": None}
        session["game"] = state
    return state


def save_state(state):
    session["game"] = state


def pick_round_ids(points, placed_ids):
    """
    Random ROUND_SIZE sample drawn from the lowest LOW_WINDOW images that
    haven't been placed yet -- points is already sorted low to high, so
    "the pool of dots left on the curve" and "the lowest activation ones"
    are the same slice, just randomized for which exact ones show up.
    """
    placed_set = set(placed_ids)
    remaining_ids = [p["id"] for p in points if p["id"] not in placed_set]
    if len(remaining_ids) < ROUND_SIZE:
        return None
    window = remaining_ids[:min(LOW_WINDOW, len(remaining_ids))]
    return random.sample(window, ROUND_SIZE)


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
    points = build_pool(neuron_id)
    if points is None:
        return jsonify({"error": "unknown neuron"}), 404

    state = get_state(neuron_id)
    by_id = {p["id"]: p for p in points}

    if state["current_round_ids"] is None:
        state["current_round_ids"] = pick_round_ids(points, state["placed_ids"])
        save_state(state)

    placed_ids = set(state["placed_ids"])
    current_round_ids = state["current_round_ids"] or []
    current_ids = set(current_round_ids)

    placed = [by_id[pid] for pid in state["placed_ids"] if pid in by_id]
    background = [
        {"x": p["x"], "y": p["y"]}
        for p in points
        if p["id"] not in placed_ids and p["id"] not in current_ids
    ]

    current = None
    if current_round_ids:
        round_points = [by_id[pid] for pid in current_round_ids]
        shuffled = round_points[:]
        random.shuffle(shuffled)
        current = {
            "slots": [{"id": p["id"], "x": p["x"], "y": p["y"]} for p in round_points],
            "images": [{"id": p["id"], "img_path": p["img_path"]} for p in shuffled],
        }

    neuron_number_match = re.search(r"neuron(\d+)", neuron_id)
    neuron_number = neuron_number_match.group(1) if neuron_number_match else "?"

    return jsonify({
        "neuron_id": neuron_id,
        "neurons": neuron_folders(),
        "neuron_number": neuron_number,
        "background": background,
        "placed": placed,
        "current": current,
        "placed_count": len(state["placed_ids"]),
        "pool_size": len(points),
        "done": current is None,
    })


@app.route("/api/submit", methods=["POST"])
def api_submit():
    data = request.get_json(silent=True) or {}
    neuron_id = data.get("neuron", "")
    order = data.get("order", [])

    points = build_pool(neuron_id)
    if points is None:
        return jsonify({"error": "unknown neuron"}), 404

    state = get_state(neuron_id)
    round_ids = state.get("current_round_ids")
    if not round_ids:
        return jsonify({"error": "no active round"}), 400

    by_id = {p["id"]: p for p in points}
    correct_order = sorted(round_ids, key=lambda pid: by_id[pid]["x"])

    positions_correct = [
        i < len(order) and order[i] == correct_order[i]
        for i in range(len(correct_order))
    ]
    is_correct = len(order) == len(correct_order) and all(positions_correct)

    if is_correct:
        state["placed_ids"].extend(correct_order)
        state["current_round_ids"] = None
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
