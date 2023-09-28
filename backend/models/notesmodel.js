const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  content: String,
  category: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  bookmarked: {
    type: Boolean,
    default: false, // Default to false if not provided
  },
});

const Note = mongoose.model('notes', noteSchema);

module.exports = Note;
