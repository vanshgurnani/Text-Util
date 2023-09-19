const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  content: String,
  category: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true, // Ensures that each note is associated with a user
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const Note = mongoose.model('notes', noteSchema);

module.exports = Note;
