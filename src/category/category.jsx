import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Category(props) {
  const [notes, setNotes] = useState([]);
  const [userId, setUserId] = useState('');
  const [expandedNotes, setExpandedNotes] = useState([]);
  const [maxContentLength, setMaxContentLength] = useState(100); 

  useEffect(() => {
    // Retrieve userId from local storage on component mount
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const fetchNotesByCategory = async (category) => {
    if (!userId) {
      console.error('userId is not available.');
      return;
    }

    try {
      // Make a GET request to fetch notes for a specific category
      const response = await axios.get(`https://text-util-five.vercel.app/api/category/${userId}?category=${category}`);
      setNotes(response.data.notes);
    } catch (error) {
      console.error('Error fetching notes by category:', error);
    }
  };

  useEffect(() => {
    // Fetch notes category-wise when the component mounts
    if (userId) {
      fetchNotesByCategory(props.category);
    }
  }, [props.category, userId]);

  const toggleNoteExpand = (index) => {
    // Create a new array with the updated expanded state for the clicked note
    setExpandedNotes((prevExpanded) => {
      const newExpanded = [...prevExpanded];
      newExpanded[index] = !newExpanded[index];
      return newExpanded;
    });
  };

  let mystyle = {
    color: props.mode === 'dark' ? 'white' : '#042743',
    backgroundColor: props.mode === 'dark' ? 'rgb(36 74 104)' : 'white',
    borderColor : props.mode === 'dark' ? 'white' : 'transparent'
  };

  return (
    <div className='container mt-4' style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
      <h2 className='text-center mb-4'>Your {props.head} Notes</h2>
      <div className='row'>
        {notes.map((note, index) => (
          <div key={note._id} className='col-md-4'>
            <div className='card mb-4' style={mystyle}>
              <div className='card-body' style={{borderRadius:'100px'}}>
                {note.content.length > maxContentLength && !expandedNotes[index] ? (
                  <p>
                    {note.content.slice(0, maxContentLength)}...
                    <p
                      className='btn btn-link'
                      onClick={() => toggleNoteExpand(index)}
                    >
                      Read More
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
                      Read Less
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
}

export default Category;
