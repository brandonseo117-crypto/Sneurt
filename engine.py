from flask import Flask, render_template
from skimage.metrics import structural_similarity

app = Flask(__name__)

# 2. Define the route (the web address)
@app.route("/")
def home():
    return render_template('switch.html')

# 4. Start the server
if __name__ == "__main__":
    app.run(debug=True)