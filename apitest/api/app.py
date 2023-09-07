from flask import Flask, request, jsonify
import nltk
from nltk.chat.util import Chat, reflections

app = Flask(__name__)

# Define the chatbot responses
pairs = [
    [
        r"my name is (.*)",
        ["Hello %1, how can I help you today?",]
    ],
    [
        r"what is your name?",
        ["I am just a chatbot created with NLTK.",]
    ],
    [
        r"how are you?",
        ["I'm doing good. How about you?",]
    ],
    [
        r"sorry (.*)",
        ["No problem, I understand.",]
    ],
    [
        r"(.*) (good|great)",
        ["That's good to hear.",]
    ],
    [
        r"bye",
        ["Goodbye! Have a nice day.",]
    ],
]

# Create a chatbot instance
chatbot = Chat(pairs, reflections)

# Define a route for the root directory ("/")
@app.route('/about')
def hello_world():
    return 'Hello, World!'

# Define the /get_response endpoint to accept both GET and POST requests
@app.route('/get_response', methods=['GET', 'POST'])
def get_response():
    if request.method == 'POST':
        user_message = request.json.get('message')
        response = chatbot.respond(user_message)
        return jsonify({"response": response})
    elif request.method == 'GET':
        # Handle GET requests here (if needed)
        return 'GET request received'

if __name__ == '__main__':
    nltk.download('punkt')  # Download NLTK data (if not already downloaded)
    app.run(debug=True)