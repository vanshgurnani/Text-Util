const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  content: String,
  category: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const Note = mongoose.model('notes', noteSchema);

module.exports = Note;
