import React, { useState } from 'react';
import axios from 'axios';

function App(props) {
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

  const clearText = () => {
    // Clear the text and summary states
    setText('');
    setSummary('');
  };

  return (
    <div className='container'>
    <h1 style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>Text Summarizer</h1>
    <textarea
      placeholder="Enter text to summarize..."
      rows="8"
      cols="50"
      style={{ resize: 'none' }}
      value={text}
      onChange={handleTextChange}
    ></textarea>
    <br />
    <div className="d-flex">
        <button className='btn btn-primary mx-3' onClick={summarizeText}>Summarize</button>
        <button className='btn btn-danger mx-3' onClick={clearText}>Clear</button>
    </div>
    {summary && (
      <div className="mt-5 summary-container" style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
        <h2>Summary:</h2>
        <p>{summary}</p>
      </div>
    )}
  

    </div>
  );
}

export default App;
