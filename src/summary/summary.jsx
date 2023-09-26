import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Spinner from '../components/spinner';

function App(props) {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingsum, setIsLoadingsum] = useState(false);
  const [summaryHistory, setSummaryHistory] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState({});

  const [userId, setUserId] = useState('');

  useEffect(() => {
    // Retrieve userId from local storage on component mount
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);

    if (!isSidebarOpen) {
      setIsLoadingsum(true);

      setTimeout(() => {
        fetchSummaryHistory();
        setTimeout(() => {
          setIsLoadingsum(false);
        }, 500);
      }, 500);
    }
  };

  const fetchSummaryHistory = () => {
    if (!userId) {
      console.error('userId is not available.');
      return;
    }

    axios
      .get(`https://text-util-ykfu.vercel.app/api/summaries/${userId}`)
      .then((response) => {
        const summaries = response.data.summaries;
        console.log('Summaries for the user:', summaries);

        const summaryStrings = summaries.map((summary) => summary.text);

        setSummaryHistory(summaryStrings);
      })
      .catch((error) => {
        console.error('Error fetching summaries:', error);
      });
  };

  useEffect(() => {
    if (userId) {
      fetchSummaryHistory();
    }
  }, [userId]);

  const handleTextChange = (e) => {
    setText(e.target.value);
  };

  const summarizeText = () => {
    setIsLoading(true);

    axios
      .post('https://flask-production-71e4.up.railway.app/get_summary', { text })
      .then((response) => {
        setSummary(response.data.summary);
        setAccuracy(response.data.accuracy);

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
    setAccuracy(null);
  };

  const saveSummaryToBackend = (summary, accuracy) => {
    axios
      .post('https://text-util-ykfu.vercel.app/api/summaries', { text, summary, accuracy, userId })
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
        <h1 className='mb-4' style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
          Text Summarizer
        </h1>
        <textarea
          className='form-control'
          placeholder='Enter text to summarize...'
          rows='12'
          cols='20'
          style={{ resize: 'none' }}
          value={text}
          onChange={handleTextChange}
        ></textarea>
        <br />
        <div className='d-flex'>
          <button className='btn btn-primary' onClick={summarizeText}>
            Summarize
          </button>
          <button className='btn btn-danger mx-3' onClick={clearText}>
            Clear
          </button>
          <button
            type='button'
            className='btn btn-primary mx-1'
            data-bs-toggle='offcanvas'
            data-bs-target='#myOffcanvas'
            onClick={toggleSidebar}
          >
            History
          </button>
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          summary && (
            <div
              className='mt-5 summary-container'
              style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}
            >
              <h2>Summary:</h2>
              <p>{summary}</p>
              {accuracy !== null && (
                <div>
                  <h2>Accuracy:</h2>
                  <p>{(accuracy * 100).toFixed(2)}%</p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      <div className={`offcanvas offcanvas-start`} tabIndex='-1' id='myOffcanvas'>
        <div className='offcanvas-header'>
          <h5 className='offcanvas-title'>History</h5>
          <button
            type='button'
            className='btn-close text-reset'
            onClick={toggleSidebar}
            aria-label='Close'
          ></button>
        </div>
        <div className='offcanvas-body'>
          {isLoadingsum ? (
            <Spinner />
          ) : (
            <ul className='list-group'>
              {summaryHistory.map((item, index) => (
                <li className='list-group-item' key={index}>
                  {typeof item === 'string' ? (
                    isExpanded[index] ? (
                      <div>
                        {item}
                        <br />
                        <button
                          className='btn btn-link btn-sm'
                          onClick={() => toggleExpansion(index)}
                        >
                          Read Less
                        </button>
                      </div>
                    ) : (
                      <div>
                        {item.slice(0, 100)}
                        {item.length > 100 && (
                          <button
                            className='btn btn-link btn-sm'
                            onClick={() => toggleExpansion(index)}
                          >
                            Read More
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <div>{item}</div>
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
