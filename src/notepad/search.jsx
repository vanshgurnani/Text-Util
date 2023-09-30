// SearchBar.js
import React from 'react';

const SearchBar = ({ searchTerm, onSearchTermChange, onSearch }) => {
  return (
    <div className="mb-3 d-flex">
      <input
        className="form-control me-2"
        type="search"
        aria-label="Search"
        placeholder="Search notes..."
        style={{ width: '70%' }}
        value={searchTerm}
        onChange={(e) => onSearchTermChange(e.target.value)}
      />
      <button onClick={onSearch} className="btn btn-primary px-4 mx-2 my-2">
        {searchTerm.trim() === '' ? 'Fetch all Notes' : 'Search'}
      </button>
    </div>
  );
};

export default SearchBar;
