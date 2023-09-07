from flask import Flask, request, jsonify
from gensim.summarization import summarize

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello, World!'

@app.route('/get_summary', methods=['POST'])
def get_summary():
    data = request.json
    text = data["text"]

    # Perform extractive summarization using TextRank
    summary = summarize(text)

    return jsonify({"summary": summary})

if __name__ == '__main__':
    app.run(debug=True)
