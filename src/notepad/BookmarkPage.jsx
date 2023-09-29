import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BookmarkPage = () => {
  const [bookmarkedNotes, setBookmarkedNotes] = useState([]);
  const [userId, setUserId] = useState('');
  // const userId = '65095898cd35f7d4a98e4cad';

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

      console.log('Bookmarked Notes:', response.data.bookmarkedNotes);
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

  useEffect(() => {
    if(userId){
      fetchBookmarkedNotes();
    }
  }, [userId]);

  return (
    <div>
      <h2>Your Bookmarked Notes</h2>
      {bookmarkedNotes.map((note) => (
        <div key={note._id}>
          <p>{note.content}</p>
          {/* Add more details as needed */}
        </div>
      ))}
    </div>
  );
};

export default BookmarkPage;
