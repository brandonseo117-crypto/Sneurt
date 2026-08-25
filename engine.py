from flask import Flask, render_template
from skimage.metrics import structural_similarity
import numpy as np
import 

app = Flask(__name__)

@app.route("/")
def home():
    return render_template('switch.html')

@app.route('/send_images')
def send():
    neuron_num = np.random.randint(1, 33)


    

if __name__ == "__main__":
    app.run(debug=True)