// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Note = require('../backend/notes/noteModel');
const User = require('../backend/notes/userModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const verifyToken = require('../backend/middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    'http://localhost:3000',
    'https://text-util-rosy.vercel.app',
    'https://text-util-jo2r.vercel.app',
    'https://flask-production-71e4.up.railway.app',
    // 'https://python-jugp.vercel.app',
  // Replace with your Vercel frontend URL
  ];
  
  app.use(cors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
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



  // Registration route
  app.post('/api/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;
  
      // Check if the email is already registered
      const existingUser = await User.findOne({ email });
  
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }
  
      // Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      // Create a new user instance with hashed password
      const newUser = new User({ username, email, password: hashedPassword });
  
      // Save the new user to the database
      await newUser.save();
  
      res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check if the password is correct
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate a JWT token for the user
    const token = jwt.sign({ userId: user._id }, 'JPHSab@1234', { expiresIn: '1h' });

    // Send the token in the response
    res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// Define a route for the home route ("/")
app.get('/', (req, res) => {
  res.send('Welcome to the Notepad API');
});

// Middleware to verify JWT token
app.use(verifyToken);

// Create a new note (authenticated route)
app.post('/api/notes', async (req, res) => {
  try {
    const { content, category } = req.body;
    const userId = req.user.userId; // Get user ID from the JWT token

    const newNote = new Note({ content, category, userId });
    await newNote.save();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's own notes (authenticated route)
app.get('/api/my-notes', async (req, res) => {
  try {
    const userId = req.user.userId; // Get user ID from the JWT token
    const notes = await Note.find({ userId }); // Fetch notes of the authenticated user
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


// Middleware to verify JWT token
app.use(verifyToken);

// More routes for reading, updating, and deleting notes

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
