import React, { useState, useEffect } from 'react';
import './text.css';
import axios from 'axios';
import { generatePDF } from './pdf';
import { FaTrash, FaShareSquare } from 'react-icons/fa';

function Textarea(props) {
  const [text, setText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [expandedNotes, setExpandedNotes] = useState([]);
  const [category, setCategory] = useState('uncategorized');



  useEffect(() => {
    // Load initial notes or perform any other necessary setup
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const response = await axios.get('https://text-util-83cs.vercel.app/api/my-notes');
      setSearchResults(response.data.notes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const handleExpandNote = (noteId) => {
  if (expandedNotes.includes(noteId)) {
    // If note is expanded, collapse it
    setExpandedNotes(expandedNotes.filter((id) => id !== noteId));
  } else {
    // If note is not expanded, expand it
    setExpandedNotes([...expandedNotes, noteId]);
  }
};


  // Function to save note to the backend and generate PDF
  const saveNoteAndGeneratePDF = async () => {
    try {
      if (text.trim() === '') {
        props.showAlert('Please enter some text before saving in PDF!', 'danger');
        return;
      }
      // Save the note to the backend
      const response = await axios.post('https://text-util-83cs.vercel.app/api/notes', { content: text, category: category });
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
      // return;
      loadNotes();
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
      if (text.trim() === '') {
        props.showAlert('Please enter some text before saving!', 'danger');
        return;
      }
  
      const authToken = localStorage.getItem('token');
  
      const response = await axios.post(
        '/api/notes',
        {
          content: text,
          category: category,
        },
        {
          headers: {
            'Authorization': `Bearer ${authToken}`, // Replace with your actual authentication token
          },
        }
      );
  
      if (response.status === 201) { // Check for a 201 Created status code (or another appropriate success code)
        props.showAlert('Note saved successfully!', 'success');
        loadNotes(); // Refresh the notes list after saving
      } else {
        console.error('Error saving note. Status:', response.status, 'Data:', response.data);
        props.showAlert('Error saving note', 'danger');
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

  // const handleUpClick = () => {
  //   let newText = text.toUpperCase();
  //   setText(newText);
  //   props.showAlert('Converted to Uppercase!', 'success');
  // };

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

  const handleDeleteNote = async (noteId) => {
    try {
      // Make an API call to delete the note by ID
      await axios.delete(`https://text-util-83cs.vercel.app/api/notes/${noteId}`);
      props.showAlert('Note deleted successfully!', 'success');
      
      // Reload the notes list after deletion
      loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      props.showAlert('Error deleting note', 'danger');
    }
  };

  const handleShareNote = async (note) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shared Note',
          text: note.content,
        });
      } catch (error) {
        console.error('Error sharing note:', error);
      }
    } else {
      alert('Sharing is not supported in this browser.');
    }
  };
  

  
  
  

  return (
    <>

      <div className={`container ${style}`} style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>

        <div className="mb-3 d-flex">
          <input
            className="form-control me-2" type="search" aria-label="Search"
            placeholder="Search notes..."
            style={{width: '70%'}}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {/*<button onClick={searchNotes} className="btn btn-primary px-4 mx-2 my-2">
            Search
  </button>*/}
          <button onClick={searchNotes} className="btn btn-primary px-4 mx-2 my-2">
            {searchTerm.trim() === '' ? 'Fetch all Notes' : 'Search'}
          </button>
        </div>
        <h1>{props.head}</h1>


        {/* Rest of your UI components */}
        <textarea
          className="form-control"
          onChange={handleUpChange}
          value={text}
          id="myBox"
          rows="8"
          style={{ resize: 'none' }}
          cols="20"
          placeholder="Enter the text"
        ></textarea>
        <div className="mb-3">
          <label htmlFor="category">Category:</label>
          <select
            id="category"
            className="form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="Uncategorized">Uncategorized</option>
            <option value="Personal">Personal</option>
            <option value="Work">Work</option>
            <option value="Development">Development</option>
            <option value="Study">Study</option>
            <option value="General">General</option>
            {/* Add more categories as needed */}
          </select>
        </div>

        {/*<button onClick={handleUpClick} className="btn btn-primary mx-2 my-2">
          Convert to Uppercase
  </button>*/}
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
          Generate PDF
        </button>
      </div>
      <div className={`container ${style}`} style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
      <p>Character Count: {text.split(/\s+/).filter((element) => element.length !== 0).length}</p>
      <p>Estimated Reading Time: {0.008 * text.split(' ').filter((element) => element.length !== 0).length} minutes</p>
      <p>{text}</p>
      {/* Display search results or all notes */}
      <h1>Search Results</h1>



      {searchResults && searchResults.length > 0 ? (
        <div className='container'>

        <div className='row'>
            {searchResults.map((note, index) => (
              <div key={note._id} className="card mx-2 my-2" style={{width:'30%'}}>
                <div className="card-body">
                    <h5 className="card-title">
                      {`${index + 1}. ${note.content.substring(0, 10)}`} {/* Display the first 100 characters */}
                      {note.content.length > 10 && (
                        <p style={{cursor:'pointer',fontWeight: 'normal',color: 'gray'}} onClick={() => handleExpandNote(note._id)}>
                          {expandedNotes.includes(note._id) ? '....Read Less' : '....Read More'}
                        </p>
                      )}
                    </h5>
                    <p className="card-text">Category: {note.category}</p>
                    <FaTrash className='mx-2' style={{ cursor: 'pointer' }} onClick={() => handleDeleteNote(note._id)} />
                    <FaShareSquare className='mx-2' style={{ cursor: 'pointer' }} onClick={() => handleShareNote(note)} />
                  {expandedNotes.includes(note._id) ? (
                    <div>
                      <p className="card-text">{note.content}</p> {/* Display full content when expanded */}
                      <p className="card-text">Timestamp: {new Date(note.timestamp).toLocaleString()}</p>
                    </div>
                  ) : (
                    <p className="card-text">Timestamp: {new Date(note.timestamp).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}


        </div>

        
        




        </div>
      ) : (
        <div>
          {searchTerm.length > 0 && <p>No matching notes found</p>}
        </div>
      )}



      
      </div>
    </>
  );
}

export default Textarea;