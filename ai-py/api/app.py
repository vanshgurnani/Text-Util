from flask import Flask, request, jsonify
from chatterbot import ChatBot
from chatterbot.trainers import ChatterBotCorpusTrainer

# Create a Flask application
app = Flask(__name__)

# Create a chatbot instance
chatbot = ChatBot("MyChatBot")

# Create a new trainer for the chatbot
trainer = ChatterBotCorpusTrainer(chatbot)

# Train the chatbot on English language data
trainer.train("chatterbot.corpus.english")

# Define a route for the root directory ("/")
@app.route('/')
def hello_world():
    return 'Hello, World!'


@app.route('/about')
def hello():
    return 'Hello!'

@app.route('/get_response', methods=['POST'])
def get_response():
    user_message = request.json.get('message')
    response = chatbot.get_response(user_message)
    return jsonify({"response": str(response)})


if __name__ == '__main__':
    # Run the Flask app on the local development server
    app.run(debug=True)
