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
});

const Note = mongoose.model('notes', noteSchema);

module.exports = Note;
