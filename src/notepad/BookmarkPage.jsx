import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BookmarkPage = () => {
  const [bookmarkedNotes, setBookmarkedNotes] = useState([]);
  // const userId = '65095898cd35f7d4a98e4cad';

  useEffect(() => {
    fetchBookmarkedNotes();
  }, []);

  const fetchBookmarkedNotes = async () => {
    try {
      const response = await axios.get(`/api/bookmarked-notes`);
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
