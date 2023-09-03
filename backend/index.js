// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// const allowedOrigins = [
//     'http://localhost:3000', // Replace with your local frontend address
//     // 'https://your-vercel-app-name.vercel.app', // Replace with your Vercel deployment URL
//     'https://text-util-rosy.vercel.app/'
//   ];
  
//   const corsOptions = {
//     origin: function (origin, callback) {
//       if (allowedOrigins.includes(origin) || !origin) {
//         callback(null, true);
//       } else {
//         callback(new Error('Not allowed by CORS'));
//       }
//     },
//   };
  
//   app.use(cors(corsOptions));
const allowedOrigins = [
    'http://localhost:3000',
    'https://text-util-rosy.vercel.app',
  // Replace with your Vercel frontend URL
  ];
  
  app.use(cors({
    origin: allowedOrigins,
  }));
// app.use(cors());
app.use(express.json());

// Define database and collection names
const DB_NAME = 'Notepad';
const COLLECTION_NAME = 'notes';

// Connect to MongoDB
mongoose.connect(`mongodb+srv://gurnanivansh57:iz64rqtBBQss8iQ7@cluster101.nuwewcc.mongodb.net/${DB_NAME}?retryWrites=true&w=majority`, {

  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const NoteSchema = new mongoose.Schema({
  content: String,
});

// Use the provided collection name in the model
const Note = mongoose.model(COLLECTION_NAME, NoteSchema);


// Define a route for the home route ("/")
app.get('/', (req, res) => {
  res.send('Welcome to the Notepad API');
});

// Create a new note
app.post('/api/notes', async (req, res) => {
  try {
    const { content } = req.body;
    const newNote = new Note({ content });
    await newNote.save();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get all notes
app.get('/apir/notes', async (req, res) => {
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

// More routes for reading, updating, and deleting notes

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
