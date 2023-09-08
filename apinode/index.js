const express = require('express');
const bodyParser = require('body-parser');
const natural = require('natural');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

// Download stopwords for natural
natural.Lexicon.stopwords = new Set(natural.stopwords);

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.post('/get_summary', (req, res) => {
  const data = req.body;
  const text = data.text;

  // Tokenize the text into sentences
  const tokenizer = new natural.SentenceTokenizer();
  const sentences = tokenizer.tokenize(text);

  // Tokenize and remove stopwords from words in sentences
  const tokenizerWord = new natural.WordTokenizer();
  const stopWords = new Set(natural.Lexicon.stopwords);
  const words = tokenizerWord.tokenize(text.toLowerCase());
  const filteredWords = words.filter((word) => word.match(/^[a-zA-Z0-9]+$/) && !stopWords.has(word));

  // Calculate word frequencies
  const wordFreq = new natural.FreqDist(filteredWords);

  // Calculate sentence scores based on word frequencies
  const sentenceScores = {};
  sentences.forEach((sentence) => {
    const sentenceWords = tokenizerWord.tokenize(sentence.toLowerCase());
    let score = 0;
    sentenceWords.forEach((word) => {
      if (wordFreq.get(word)) {
        score += wordFreq.get(word);
      }
    });
    sentenceScores[sentence] = score;
  });

  // Get the top N sentences for summary
  const summarySentences = Object.keys(sentenceScores).sort((a, b) => sentenceScores[b] - sentenceScores[a]).slice(0, 5);

  // Generate the summary
  const summary = summarySentences.join(' ');

  res.json({ summary });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
