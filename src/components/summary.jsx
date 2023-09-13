import React, { useState } from 'react';
import axios from 'axios';
import Spinner from './spinner'

function App(props) {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [accuracy, setAccuracy] = useState(null); // Initialize accuracy as null
  const [isLoading, setIsLoading] = useState(false);

  const handleTextChange = (e) => {
    setText(e.target.value);
  };

  const summarizeText = () => {
    setIsLoading(true);

    axios.post('https://flask-production-71e4.up.railway.app/get_summary', { text })
      .then((response) => {
        setSummary(response.data.summary);
        setAccuracy(response.data.accuracy); // Set accuracy from the API response
      })
      .catch((error) => {
        console.error('Error:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const clearText = () => {
    setText('');
    setSummary('');
    setAccuracy(null); // Clear accuracy when clearing text
  };

  return (
    <div className='container'>
      <h1 style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>Text Summarizer</h1>
      <textarea
        className="form-control"
        placeholder="Enter text to summarize..."
        rows="8"
        cols="20"
        style={{ resize: 'none' }}
        value={text}
        onChange={handleTextChange}
      ></textarea>
      <br />
      <div className="d-flex">
        <button className='btn btn-primary mx-3' onClick={summarizeText}>Summarize</button>
        <button className='btn btn-danger mx-3' onClick={clearText}>Clear</button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        summary && (
          <div className="mt-5 summary-container" style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
            <h2>Summary:</h2>
            <p>{summary}</p>
            {accuracy !== null && ( // Display accuracy only when it's available
              <div>
                <h2>Accuracy:</h2>
                <p>{(accuracy * 100).toFixed(2)}%</p> {/* Format accuracy as a percentage */}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default App;
