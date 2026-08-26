from flask import Flask, render_template, jsonify
from skimage.metrics import structural_similarity
import numpy as np
import cv2
from pathlib import Path

app = Flask(__name__)

@app.route("/")
def home():
    return render_template('switch.html')

@app.route('/api/images', methods=['GET'])
def send():
    neuron_num = np.random.randint(1, 33)
    score_threshold = 0.2
    grid_size = 6
    all_imgs = []
    folder = Path(f'static/imagesforsorting/images_190923_neuron{neuron_num}')
    for image in sorted(folder.iterdir(), reverse=False):
        if len(all_imgs) == grid_size:
            break
        all_imgs.append(str(image))
        img_index = all_imgs.index(str(image))
        if img_index == 0:
            continue
        else:
            prior_idx = img_index - 1
            prior_img = all_imgs[prior_idx]
            image1 = cv2.imread(image)
            image2 = cv2.imread(prior_img)
            score = structural_similarity(image1, image2, channel_axis=-1, data_range=255)
            print(score)
            if abs(score) <= score_threshold:
                continue
            else:
                all_imgs.remove(str(image))

    object_iterable = []
    for idx, file_path in enumerate(all_imgs):
        d = {}
        d['img_id'] = idx + 1
        d['val'] = len(all_imgs) - idx
        d['img_path'] = file_path
        object_iterable.append(d)

    final_payload = [payload for payload in object_iterable]

    return jsonify(final_payload), 200
    
if __name__ == "__main__":
    app.run(debug=True)