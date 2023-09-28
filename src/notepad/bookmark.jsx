import React from 'react';
import Checkbox from '@mui/material/Checkbox';
import axios from 'axios';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';

const Icon = (props) => {
  const [checked, setChecked] = React.useState(false);

  const handleChange = () => {
    setChecked(!checked);
  };

  const handleBookmarkNote = async (noteId) => {
    try {
      await axios.post(`/api/notes/bookmark/${noteId}`, {});
      console.log('Note bookmarked successfully!');
    } catch (error) {
      console.error('Error bookmarking note:', error);
      console.log('Error bookmarking note');
    }
  };

  return (
    <Checkbox
      checked={checked}
      onChange={handleChange}
      icon={<BookmarkBorderIcon />}
      checkedIcon={<BookmarkIcon />}
      onClick={() => handleBookmarkNote(props.noteId)}
    />
  );
};

export default Icon;
