import React from 'react';
import Checkbox from '@mui/material/Checkbox';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';

const Icon = () => {
  const [checked, setChecked] = React.useState(false);

  const handleChange = () => {
    setChecked(!checked);
  };

  const addBookmark = () => {
    console.log('Icon clicked!');
    // Add any other logic you want to perform when the icon is clicked
  };

  return (
    <Checkbox
      checked={checked}
      onChange={handleChange}
      icon={<BookmarkBorderIcon />}
      checkedIcon={<BookmarkIcon />}
      onClick={addBookmark}
    />
  );
};

export default Icon;
