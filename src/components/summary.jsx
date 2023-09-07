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
    <>
    <center>
    <h1>Text Summarizer</h1>
    <textarea
      placeholder="Enter text to summarize..."
      rows="8"
      cols="50"
      style={{ resize: 'none' }}
      value={text}
      onChange={handleTextChange}
    ></textarea>
    <br />
    <button className='btn btn-primary' onClick={summarizeText}>Summarize</button>
    {summary && (
      <div className="mt-5 summary-container">
        <h2>Summary:</h2>
        <p>{summary}</p>
      </div>
    )}
  </center>
  

    </>
  );
}

export default App;
