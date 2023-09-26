import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { generatePDF } from './pdf';
import { FaTrash, FaShareSquare, FaVolumeUp,FaFilePdf } from 'react-icons/fa';
// import Quil from '../components/quil';

function Textarea(props) {
  const [text, setText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [expandedNotes, setExpandedNotes] = useState([]);
  const [category, setCategory] = useState('uncategorized');
  const [noteColors, setNoteColors] = useState({}); // State variable to store note colors




  useEffect(() => {
    // Load initial notes or perform any other necessary setup
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const response = await axios.get('/api/fetch-notes');
      setSearchResults(response.data.notes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  function getRandomLightColor() {
    const letters = 'ABCDEF';
    let color = '#';
    for (let i = 0; i < 3; i++) {
      color += letters[Math.floor(Math.random() * 6)]; // Use letters A-F
    }
    return color;
  }
  
  
  

  const handleExpandNote = (noteId) => {
    if (expandedNotes.includes(noteId)) {
      // If note is expanded, collapse it
      setExpandedNotes(expandedNotes.filter((id) => id !== noteId));
    } else {
      // If note is not expanded, expand it and set a color
      const color = getRandomLightColor();
      setExpandedNotes([...expandedNotes, noteId]);
      setNoteColors({ ...noteColors, [noteId]: color });
    }
  };
  
  


const saveNoteAndGeneratePDF = async (text, category) => {
  const pdfDataURI = generatePDF(text, category); // Call the PDF generator function

  // Trigger PDF download (you can use a download link or any other method)
  const link = document.createElement('a');
  link.href = pdfDataURI;
  link.download = 'note.pdf';
  link.click();

  props.showAlert('PDF created Successfully!', 'success');

};


  const searchNotes = async () => {
    if (searchTerm.trim() === '') {
      // return;
      loadNotes();
    }
    try {
      const response = await axios.get(`/api/search?searchTerm=${searchTerm}`);
      // setSearchResults(response.data.notes);
      // Sort the search results by timestamp in descending order
      const sortedResults = response.data.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setSearchResults(sortedResults);
    } catch (error) {
      console.error('Error searching for notes:', error);
    }
  };


  const saveNote = async () => {
    try {
      if (text.trim() === '') {
        props.showAlert('Please enter some text before saving in PDF!', 'danger');
        return;
      }
      // Save the note to the backend
      const response = await axios.post('/api/notes', { content: text, category: category });
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


  const handleUpChange = (event) => {
    setText(event.target.value);
  };

  const handleClear = () => {
    let newText = '';
    setText(newText);
  };

  const handleTextToSpeech = (text) => {
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
      await axios.delete(`/api/notes/${noteId}`);
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
          text: `Hey All,\n\nI wanted to share some information with you from my notepad:\n\n${note.content}\n\nFeel free to reach out if you have any questions or need further details.\n\n`,
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

        
        <button onClick={handleClear} className="btn btn-danger mx-2 my-2">
          Clear
        </button>
        <button onClick={saveNote} className="btn btn-primary mx-2 my-2">
          Save Note
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

        <div className='row mx-auto'>
        {searchResults.map((note, index) => (
          <div className='col-md-4 mb-4'>
          
          <div key={note._id} className="card mx-2 my-2" style={{
            width: '18rem',
            backgroundColor: noteColors[note._id] || getRandomLightColor(),
          }}>
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
              <FaVolumeUp className='mx-2' style={{ cursor: 'pointer' }} onClick={() => handleTextToSpeech(note.content)} />
              <FaFilePdf className='mx-2' style={{ cursor: 'pointer' }} onClick={() => saveNoteAndGeneratePDF(note.content, note.category)} />

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