const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
    content: String,
    category: String,
    timestamp: {
      type: Date,
      default: Date.now, // This sets the default value to the current date and time
    },
  });

  module.exports = mongoose.model('Note', NoteSchema);