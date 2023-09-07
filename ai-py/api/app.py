from flask import Flask

# Create a Flask application
app = Flask(__name__)

# Define a route for the root directory ("/")
@app.route('/')
def hello_world():
    return 'Hello, World!'
@app.route('/about')
def hello():
    return 'Hello!'

if __name__ == '__main__':
    # Run the Flask app on the local development server
    app.run(debug=True)
