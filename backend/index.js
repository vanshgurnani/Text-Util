// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Note = require ('./models/notesmodel');
const User = require('./models/usersmodel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Summary = require('./models/summarymodel');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    'http://localhost:3000',
    'https://text-util-iota.vercel.app',
    'https://notenews.onrender.com',
    'https://flask-production-71e4.up.railway.app',
    // 'https://python-jugp.vercel.app',
  // Replace with your Vercel frontend URL
  ];
  
  app.use(cors({
    origin: allowedOrigins,
  }));
// app.use(cors());
app.use(express.json());

// Define database and collection names
const DB_NAME = 'Notepad';

// Connect to MongoDB
mongoose.connect(`mongodb+srv://gurnanivansh57:iz64rqtBBQss8iQ7@cluster101.nuwewcc.mongodb.net/${DB_NAME}?retryWrites=true&w=majority`, {

  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });


// Registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email , password });
    if (user) {
      res.status(200).json({ message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Define a route for the home route ("/")
app.get('/', (req, res) => {
  res.send('Welcome to the Notepad API');
});

// Create a new note
app.post('/api/notes', async (req, res) => {
  try {
    const { content, category } = req.body; // Include the category in the request
    const newNote = new Note({ content, category }); // Save the category along with the note
    await newNote.save();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all notes
app.get('/api/fetch-notes', async (req, res) => {
  try {
    const notes = await Note.find(); // Fetch all notes from the database
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/search', async (req, res) => {
  try {
    const { searchTerm } = req.query; // Get the search term from the query parameter

    // Use MongoDB or your database of choice to search for notes based on the search term
    const matchedNotes = await Note.find({ content: { $regex: searchTerm, $options: 'i' } });

    res.json({ notes: matchedNotes });
  } catch (error) {
    console.error('Error searching for notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/previous-notes', async (req, res) => {
  try {
    // Retrieve all previous notes from your database
    const previousNotes = await Note.findOne().sort({ '_id': -1 }); // Sort by creation date in descending order to get the most recent first
    res.json({ previousNotes });
  } catch (error) {
    console.error('Error fetching previous notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE route to delete a note by its _id
app.delete('/api/notes/:noteId', async (req, res) => {
  try {
    const { noteId } = req.params;

    // Use the deleteOne method to delete the note by its _id
    const result = await Note.deleteOne({ _id: noteId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    return res.status(200).json({ success: true, message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// Define a route for updating a note
app.put('/api/update/:noteId', async (req, res) => {
  const { noteId } = req.params;
  const { content } = req.body;

  try {
    // Find the note by ID
    const note = await Note.findById(noteId);

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    // Update the note's content
    note.content = content;
    
    // Save the updated note
    await note.save();

    res.status(200).json({ success: true, message: 'Note updated successfully' });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ success: false, message: 'Error updating note' });
  }
});


// Summary information

app.post('/saveSummary', async (req, res) => {
  try {
    const { text, summary, accuracy } = req.body;
    const newSummary = new Summary({
      text,
      summary,
      accuracy,
    });
    await newSummary.save();
    res.json({ message: 'Summary saved successfully!' });
  } catch (error) {
    console.error('Error saving summary:', error);
    res.status(500).json({ error: 'An error occurred while saving the summary.' });
  }
});

// Endpoint to get the summary history
app.get('/getSummaryHistory', async (req, res) => {
  try {
    // Fetch all summaries from MongoDB
    const summaries = await Summary.find({}, 'summary'); // Modify the query as needed

    // Extract the summary text from the results
    const summaryHistory = summaries.map((summary) => summary.summary);

    res.json({ summaryHistory });
  } catch (error) {
    console.error('Error fetching summary history:', error);
    res.status(500).json({ error: 'An error occurred while fetching the summary history.' });
  }
});





// More routes for reading, updating, and deleting notes

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
