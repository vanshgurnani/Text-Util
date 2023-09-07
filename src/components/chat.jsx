import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');

  const handleTextChange = (e) => {
    setText(e.target.value);
  };

  const summarizeText = () => {
    // Send a POST request to your Flask API
    axios.post('/get_summary', { text })
      .then((response) => {
        setSummary(response.data.summary);
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  };

  return (
    <div className="App">
      <h1>Text Summarizer</h1>
      <div className="input-container">
        <textarea
          placeholder="Enter text to summarize..."
          rows="10"
          value={text}
          onChange={handleTextChange}
        />
        <button onClick={summarizeText}>Summarize</button>
      </div>
      {summary && (
        <div className="summary-container">
          <h2>Summary:</h2>
          <p>{summary}</p>
        </div>
      )}
    </div>
  );
}

export default App;
