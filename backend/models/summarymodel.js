// models/summary.js
const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  text: String, // The original text
  summary: String, // The generated summary
  accuracy: Number, // The accuracy of the summary
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Summary', summarySchema);
