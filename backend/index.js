// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Note = require('../backend/notes/noteModel');
const User = require('../backend/notes/userModel');

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

    // Create a new user instance
    const newUser = new User({ username, email, password });
    
    // Save the new user to the database
    await newUser.save();
    
    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user exists in the database
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare the provided password with the hashed password stored in the database
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If the credentials are valid, generate a JSON Web Token (JWT)
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      'JPHSab@1234', // Replace with your actual secret key
      { expiresIn: '1h' } // Set the token expiration time
    );

    // Send the token and user information in the response
    res.status(200).json({ success: true, token, user: { _id: user._id, email: user.email } });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Internal server error' });
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




// More routes for reading, updating, and deleting notes

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
