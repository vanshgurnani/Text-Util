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

        // Save the summary to the backend
        saveSummaryToBackend(response.data.summary, response.data.accuracy);
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


  // Function to save the summary to the backend
  const saveSummaryToBackend = (summary, accuracy) => {
    axios
      .post('https://text-util-ykfu.vercel.app/saveSummary', { text, summary, accuracy }) // Replace with your backend endpoint
      .then((response) => {
        console.log('Summary saved successfully:', response.data.message);
      })
      .catch((error) => {
        console.error('Error saving summary:', error);
      });
  };

  return (
    <>
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
        <button type="button" class="btn btn-primary" data-bs-toggle="offcanvas" data-bs-target="#myOffcanvas">
  Open Sidebar
</button>

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


    <div class="offcanvas offcanvas-start" tabindex="-1" id="myOffcanvas">
  <div class="offcanvas-header">
    <h5 class="offcanvas-title">History</h5>
    <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
  </div>
  <div class="offcanvas-body">
    <ul class="list-group">
      <li class="list-group-item">Item 1</li>
      <li class="list-group-item">Item 2</li>
      <li class="list-group-item">Item 3</li>
    </ul>
  </div>
</div>


  </>
  );
}

export default App;
