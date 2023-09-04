import React, { useState, useEffect } from 'react';
import './text.css';
import axios from 'axios';
import { generatePDF } from './pdf';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaTrash } from 'react-icons/fa';

function Textarea(props) {
  const [text, setText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    // Load initial notes or perform any other necessary setup
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const response = await axios.get('https://text-util-83cs.vercel.app/api/fetch-notes');
      setSearchResults(response.data.notes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  // Function to save note to the backend and generate PDF
  const saveNoteAndGeneratePDF = async () => {
    try {
      // Save the note to the backend
      const response = await axios.post('https://text-util-83cs.vercel.app/api/notes', { content: text });
      if (response.data.success) {
        props.showAlert('Note saved successfully!', 'success');
        loadNotes(); // Refresh the notes list after saving

        // Generate PDF
        const pdfDataURI = generatePDF(text); // Call the PDF generator function

        // Trigger PDF download (you can use a download link or any other method)
        const link = document.createElement('a');
        link.href = pdfDataURI;
        link.download = 'note.pdf';
        link.click();
      }
    } catch (error) {
      console.error('Error saving note:', error);
      props.showAlert('Error saving note', 'danger');
    }
  };

  const searchNotes = async () => {
    if (searchTerm.trim() === '') {
      toast.error('Please enter a search item.');
      return;
    }
    try {
      const response = await axios.get(`https://text-util-83cs.vercel.app/api/search?searchTerm=${searchTerm}`);
      // setSearchResults(response.data.notes);
      // Sort the search results by timestamp in descending order
      const sortedResults = response.data.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setSearchResults(sortedResults);
    } catch (error) {
      console.error('Error searching for notes:', error);
    }
  };

  // Function to save note to the backend
  const saveNote = async () => {
    try {
      const response = await axios.post('https://text-util-83cs.vercel.app/api/notes', { content: text });
      if (response.data.success) {
        props.showAlert('Note saved successfully!', 'success');
        loadNotes(); // Refresh the notes list after saving
      }
    } catch (error) {
      console.error('Error saving note:', error);
      props.showAlert('Error saving note', 'danger');
    }
  };

  const [style, setStyle] = useState({
    color: 'white',
    backgroundColor: 'black',
  });

  const handleUpClick = () => {
    let newText = text.toUpperCase();
    setText(newText);
    props.showAlert('Converted to Uppercase!', 'success');
  };

  const handleUpChange = (event) => {
    setText(event.target.value);
  };

  const handleClear = () => {
    let newText = '';
    setText(newText);
  };

  const handleTextToSpeech = () => {
    if ('speechSynthesis' in window) {
      const speech = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(speech);
    } else {
      alert('Text-to-speech is not supported in this browser.');
    }
  };

  
  
  

  return (
    <>
      <div className={`container ${style}`} style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
        <div className='d-flex justify-content-between'>

          <h1>{props.head}</h1>
          {/* Search input and button */}
          <div className="mb-3 d-flex">
            <input
              className="form-control me-2" type="search" aria-label="Search"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button onClick={searchNotes} className="btn btn-primary px-4 mx-2 my-2">
              Search
            </button>
          </div>
        </div>


        {/* Rest of your UI components */}
        <textarea
          className="form-control"
          onChange={handleUpChange}
          value={text}
          id="myBox"
          rows="8"
          style={{ resize: 'none' }}
          cols="30"
          placeholder="Enter the text"
        ></textarea>
        <button onClick={handleUpClick} className="btn btn-primary mx-2 my-2">
          Convert to Uppercase
        </button>
        <button onClick={handleClear} className="btn btn-danger mx-2 my-2">
          Clear
        </button>
        <button onClick={handleTextToSpeech} className="btn btn-success mx-2 my-2">
          Text to Speech
        </button>
        <button onClick={saveNote} className="btn btn-primary mx-2 my-2">
          Save Note
        </button>
        <button onClick={saveNoteAndGeneratePDF} className="btn btn-primary mx-2 my-2">
          Save Note and Generate PDF
        </button>
      </div>
      <div className={`container ${style}`} style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
      <p>Character Count: {text.split(/\s+/).filter((element) => element.length !== 0).length}</p>
      <p>Estimated Reading Time: {0.008 * text.split(' ').filter((element) => element.length !== 0).length} minutes</p>
      <p>{text}</p>
      {/* Display search results or all notes */}
      {searchResults && searchResults.length > 0 ? (
        <div>
          <h1>Search Results</h1>
          {searchResults.map((note, index) => (
            <div key={note._id} className="card">
              <div className="card-body">
                <h5 className="card-title">{`${index + 1}. Note Content`}</h5>
                <p className="card-text">Timestamp: {new Date(note.timestamp).toLocaleString()}</p>
                  <FaTrash /> Delete
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <h1>All Notes</h1>
          {searchTerm.length > 0 && <p>No matching notes found</p>}
        </div>
      )}
      </div>
    </>
  );
}

export default Textarea;