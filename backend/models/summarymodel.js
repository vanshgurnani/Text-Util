// models/summary.js
const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  text: String, // The original text
  summary: String, // The generated summary
  accuracy: Number, // The accuracy of the summary
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Summary', summarySchema);
