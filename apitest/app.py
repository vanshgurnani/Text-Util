from flask import Flask, request, jsonify
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
from nltk.probability import FreqDist
from nltk.tokenize import word_tokenize
import nltk
import heapq
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
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

    # Calculate accuracy by comparing generated summary with original text input
    accuracy = calculate_accuracy(text, summary)

    return jsonify({"summary": summary, "accuracy": accuracy})

def calculate_accuracy(original_text, generated_summary):
    # Implement your custom accuracy calculation logic here
    # You can compare the similarity or overlap between the original text and the generated summary
    # For example, you can use a text similarity metric like cosine similarity or Jaccard similarity
    # The exact calculation depends on your specific requirements

    # As a placeholder, this example calculates accuracy based on the ratio of shared words
    original_words = set(original_text.lower().split())
    summary_words = set(generated_summary.lower().split())
    
    shared_words = original_words.intersection(summary_words)
    
    # Calculate accuracy as the ratio of shared words to the total words in the original text
    accuracy = len(shared_words) / len(original_words)
    
    return accuracy

if __name__ == '__main__':
    app.run(debug=True)
