from flask import Flask, render_template
from skimage.metrics import structural_similarity
import numpy as np
import cv2
from pathlib import Path

app = Flask(__name__)

@app.route("/")
def home():
    return render_template('switch.html')

@app.route('/sendimages')
def send():
    neuron_num = np.random.randint(1, 33)
    score_threshold = 0.2
    all_imgs = []
    folder = (Path(f'imagesforsorting/images_190923_neuron{neuron_num}'))
    for image in sorted(folder.iterdir()):
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
            if abs(score) >= score_threshold:
                continue
            else:
                all_imgs.remove(str(image))
            
            

    
if __name__ == "__main__":
    app.run(debug=True)