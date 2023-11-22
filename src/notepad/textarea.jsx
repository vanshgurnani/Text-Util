import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import axios from 'axios';
import { generatePDF } from './pdf';
import { FaTrash, FaShareSquare, FaVolumeUp,FaFilePdf } from 'react-icons/fa';
import BookmarkIcon from './bookmark';
import SearchBar from './search';
// import Quil from '../components/quil';
// https://text-util-five.vercel.app

function Textarea(props) {
  const [text, setText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [expandedNotes, setExpandedNotes] = useState([]);
  const [category, setCategory] = useState('uncategorized');
  const [noteColors, setNoteColors] = useState({}); // State variable to store note colors
  const [userId, setUserId] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const notesPerPage = 6; // Adjust the number of notes per page here

  // Calculate indexes for pagination
  const indexOfFirstNote = (currentPage - 1) * notesPerPage;
  const indexOfLastNote = indexOfFirstNote + notesPerPage;
  const currentNotes = searchResults.slice(indexOfFirstNote, indexOfLastNote);

  // Calculate total pages
  const totalPages = Math.ceil(searchResults.length / notesPerPage);


  useEffect(() => {
    // Retrieve userId from local storage on component mount
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  // Function to handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };



  const loadNotes = async () => {
    if (!userId) {
      console.error('userId is not available.');
      return;
    }
  
    try {
      const response = await axios.get(`https://text-util-five.vercel.app/api/fetch-notes/${userId}`);
      const notes = response.data.notes;
  
      if (notes && Array.isArray(notes)) {
        console.log('Notes for the user:', notes);
        setSearchResults(notes);
      } else {
        console.error('Invalid notes data received:', notes);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };
  



  useEffect(() => {
    if (userId) {
      loadNotes();
    }
  }, [userId]);

  
  
  
  

  const handleExpandNote = (noteId) => {
    if (expandedNotes.includes(noteId)) {
      // If note is expanded, collapse it
      setExpandedNotes(expandedNotes.filter((id) => id !== noteId));
    } else {
      setExpandedNotes([...expandedNotes, noteId]);
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
    loadNotes(); // Load all notes for the user if the search term is empty
  } else {
    try {
      const response = await axios.get(`https://text-util-five.vercel.app/api/search/${userId}?searchTerm=${searchTerm}`);
      const sortedResults = response.data.notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setSearchResults(sortedResults);
    } catch (error) {
      console.error('Error searching for notes:', error);
    }
  }
};



  const saveNote = async () => {
    try {
      if (text.trim() === '') {
        props.showAlert('Please enter some text before saving in PDF!', 'danger');
        return;
      }
      // Save the note to the backend
      const response = await axios.post('https://text-util-five.vercel.app/api/notes', { content: text, category: category, userId : userId });
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
      await axios.delete(`https://text-util-five.vercel.app/api/notes/${noteId}`);
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
          <SearchBar
            searchTerm={searchTerm}
            onSearchTermChange={(value) => setSearchTerm(value)}
            onSearch={searchNotes}
          />
          <div className="mb-3 d-flex justify-content-between">
            <h1>{props.head}</h1>
            <Link to='/bookmark'><img style={{ width: '50px', borderRadius: '60%', cursor: 'pointer', filter: props.mode === 'dark' ? 'invert(1)' : 'invert(0)' }} src="images/icon1.png" alt="icon" /></Link>
          </div>
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
          <h1>Search Results</h1>
          {searchResults && searchResults.length > 0 ? (
            <>
            <div className='container'>
              <div className='row mx-auto'>
                {currentNotes.map((note, index) => (
                  <div className='col-md-4 mb-4' key={note._id}>
                    <div key={note._id} className="card mx-2 my-2" style={{ width: '18rem', backgroundColor: noteColors[note._id] }}>
                      <div className="card-body">
                        <h5 className="card-title">
                          {`${indexOfFirstNote + index + 1}. ${note.content.substring(0, 10)}`}
                          {note.content.length > 10 && (
                            <p style={{ cursor: 'pointer', fontWeight: 'normal', color: 'gray' }} onClick={() => handleExpandNote(note._id)}>
                              {expandedNotes.includes(note._id) ? '....Read Less' : '....Read More'}
                            </p>
                          )}
                        </h5>
                        <BookmarkIcon noteId={note._id} />
                        <p className="card-text">Category: {note.category}</p>
                        <FaTrash className='mx-2' style={{ cursor: 'pointer' }} onClick={() => handleDeleteNote(note._id)} />
                        <FaShareSquare className='mx-2' style={{ cursor: 'pointer' }} onClick={() => handleShareNote(note)} />
                        <FaVolumeUp className='mx-2' style={{ cursor: 'pointer' }} onClick={() => handleTextToSpeech(note.content)} />
                        <FaFilePdf className='mx-2' style={{ cursor: 'pointer' }} onClick={() => saveNoteAndGeneratePDF(note.content, note.category)} />
                        {expandedNotes.includes(note._id) ? (
                          <div>
                            <p className="card-text">{note.content}</p>
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

            {/* Pagination */}
    <nav aria-label="Page navigation example">
    <ul className="pagination justify-content-center">
      <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
        <button className="page-link" onClick={() => handlePageChange(currentPage - 1)}>Previous</button>
      </li>
      {Array.from({ length: totalPages }, (_, i) => (
        <li key={i} className={`page-item ${currentPage === i + 1 ? 'active' : ''}`}>
          <button className="page-link" onClick={() => handlePageChange(i + 1)}>{i + 1}</button>
        </li>
      ))}
      <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
        <button className="page-link" onClick={() => handlePageChange(currentPage + 1)}>Next</button>
      </li>
    </ul>
  </nav>


            </>
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