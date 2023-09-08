from flask import Flask, request, jsonify
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
from nltk.probability import FreqDist
from nltk.tokenize import word_tokenize
from nltk import sent_tokenize
import nltk
import heapq
from flask_cors import CORS  # Import CORS

app = Flask(__name__)
CORS(app)  # Initialize CORS with your Flask app

nltk.download('stopwords')

@app.route('/')
def hello_world():
    return 'Hello, World!'

@app.route('/get_summary', methods=['POST'])
def get_summary():
    data = request.json
    text = data["text"]

    # Tokenize the text into sentences
    sentences = sent_tokenize(text)

    # Tokenize and remove stopwords from words in sentences
    stop_words = set(stopwords.words("english"))
    words = word_tokenize(text)
    filtered_words = [word.lower() for word in words if word.isalnum() and word.lower() not in stop_words]

    # Calculate word frequencies
    word_freq = FreqDist(filtered_words)

    # Calculate sentence scores based on word frequencies
    sentence_scores = {}
    for sentence in sentences:
        for word in word_tokenize(sentence.lower()):
            if word in word_freq.keys():
                if sentence not in sentence_scores:
                    sentence_scores[sentence] = word_freq[word]
                else:
                    sentence_scores[sentence] += word_freq[word]

    # Get the top N sentences for summary
    summary_sentences = heapq.nlargest(5, sentence_scores, key=sentence_scores.get)

    # Generate the summary
    summary = ' '.join(summary_sentences)

    return jsonify({"summary": summary})

if __name__ == '__main__':
    app.run(debug=True)
