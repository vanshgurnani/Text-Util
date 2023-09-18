import React, { useState } from 'react';
import axios from 'axios';
import Spinner from './spinner'

function App(props) {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [accuracy, setAccuracy] = useState(null); // Initialize accuracy as null
  const [isLoading, setIsLoading] = useState(false);
  const [summaryHistory, setSummaryHistory] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState({});

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);

    // Fetch summary history when the sidebar is opened
    if (!isSidebarOpen) {
      fetchSummaryHistory();
    }

    setTimeout(() => {
      fetchSummaryHistory();
    }, 500); // Fetch notes after a 500ms delay (adjust as needed)
  };

  const fetchSummaryHistory = () => {
    // Fetch summary history from the backend
    axios
      .get('https://text-util-ykfu.vercel.app/getSummaryHistory') // Replace with your backend endpoint
      .then((response) => {
        setSummaryHistory(response.data.summaryHistory);
      })
      .catch((error) => {
        console.error('Error fetching summary history:', error);
      });
  };

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

  const toggleExpansion = (index) => {
    setIsExpanded((prevState) => ({
      ...prevState,
      [index]: !prevState[index],
    }));
  };

  return (
    <>
    <div className='container'>
      <h1 className='mx-3 mb-4' style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>Text Summarizer</h1>
      <textarea
        className="form-control mx-3"
        placeholder="Enter text to summarize..."
        rows="12"
        cols="20"
        style={{ resize: 'none' }}
        value={text}
        onChange={handleTextChange}
      ></textarea>
      <br />
      <div className="d-flex">
        <button className='btn btn-primary mx-3' onClick={summarizeText}>Summarize</button>
        <button className='btn btn-danger mx-3' onClick={clearText}>Clear</button>
        <button type="button" class="btn btn-primary mx-3" data-bs-toggle="offcanvas" data-bs-target="#myOffcanvas" onClick={toggleSidebar}>History</button>
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


    <div className={`offcanvas offcanvas-start ${isSidebarOpen ? 'show' : ''}`} tabIndex="-1" id="myOffcanvas">
        <div className="offcanvas-header">
          <h5 className="offcanvas-title">History</h5>
          <button type="button" className="btn-close text-reset" onClick={toggleSidebar} aria-label="Close"></button>
        </div>
        <div className="offcanvas-body">
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="list-group">
  {summaryHistory.map((item, index) => (
    <li className="list-group-item" key={index}>
      {isExpanded[index] ? (
        <div>
          {item}
          <br />
          <button
            className="btn btn-link btn-sm"
            onClick={() => toggleExpansion(index)}
          >
            Read Less
          </button>
        </div>
      ) : (
        <div>
          {item.slice(0, 100)} {/* Display the first 100 characters */}
          {item.length > 100 && (
            <button
              className="btn btn-link btn-sm"
              onClick={() => toggleExpansion(index)}
            >
              Read More
            </button>
          )}
        </div>
      )}
    </li>
  ))}
</ul>

        )}
        </div>
      </div>


  </>
  );
}

export default App;
