import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BookmarkPage = (props) => {
  const [bookmarkedNotes, setBookmarkedNotes] = useState([]);
  const [userId, setUserId] = useState('');
  const [expandedNotes, setExpandedNotes] = useState([]);
  const [maxContentLength, setMaxContentLength] = useState(100); // Adjust as needed

  useEffect(() => {
    // Retrieve userId from local storage on component mount
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const fetchBookmarkedNotes = async () => {
    if (!userId) {
      console.error('userId is not available.');
      return;
    }
    try {
      const response = await axios.get(`https://text-util-five.vercel.app/api/bookmarked-notes/${userId}`);
      setBookmarkedNotes(response.data.bookmarkedNotes);
      // Initialize expanded state for each note
      setExpandedNotes(new Array(response.data.bookmarkedNotes.length).fill(false));
    } catch (error) {
      console.error('Error fetching bookmarked notes:', error);
      // Log additional details about the error
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      } else if (error.request) {
        console.error('No response received. Request:', error.request);
      } else {
        console.error('Error message:', error.message);
      }
    }
  };

  const toggleNoteExpand = (index) => {
    // Create a new array with the updated expanded state for the clicked note
    setExpandedNotes((prevExpanded) => {
      const newExpanded = [...prevExpanded];
      newExpanded[index] = !newExpanded[index];
      return newExpanded;
    });
  };

  useEffect(() => {
    if (userId) {
      fetchBookmarkedNotes();
    }
  }, [userId]);

  return (
    <div className='container mt-4' style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
      <h2 className='text-center mb-4'>Your Bookmarked Notes</h2>
      <div className='row'>
        {bookmarkedNotes.map((note, index) => (
          <div key={note._id} className='col-md-4'>
            <div className='card mb-4'>
              <div className='card-body'>
                {note.content.length > maxContentLength && !expandedNotes[index] ? (
                  <p>
                    {note.content.slice(0, maxContentLength)}...
                    <p
                      className='btn btn-link'
                      onClick={() => toggleNoteExpand(index)}
                    >
                      ....Read More
                    </p>
                  </p>
                ) : (
                  <p>{note.content}</p>
                )}
                {expandedNotes[index] && (
                  <div>
                    <p
                      className='btn btn-link'
                      onClick={() => toggleNoteExpand(index)}
                    >
                      ....Read Less
                    </p>
                  </div>
                )}
                <p className='card-text'>{note.category}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookmarkPage;
