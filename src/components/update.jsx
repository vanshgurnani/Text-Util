import React, { useState } from 'react';
import axios from 'axios';

function Update(props) {
  // State to track the updated content
  const [updatedContent, setUpdatedContent] = useState(props.currentNoteContent);

  // Function to handle changes in the input field
  const handleContentChange = (e) => {
    setUpdatedContent(e.target.value);
  };

  // Function to update a note by ID
const updateNote = async (noteId, updatedContent) => {
    try {
      // Make a PUT request to the backend route with the updated content
      const response = await axios.put(`https://text-util-83cs.vercel.app/api/update/${noteId}`, { content: updatedContent });
  
      if (response.data.success) {
        // Note updated successfully
        return { success: true, message: 'Note updated successfully' };
      } else {
        // Handle the case where the update was not successful
        return { success: false, message: 'Note update failed' };
      }
    } catch (error) {
      // Handle any errors that occur during the PUT request
      console.error('Error updating note:', error);
      return { success: false, message: 'Error updating note' };
    }
  };

  // Function to handle the "Save changes" button click
  const handleSaveChanges = async () => {
    // Call the updateNote function to update the note's content
    const updateResult = await props.updateNote(props.currentNoteId, updatedContent);

    if (updateResult.success) {
      // Note updated successfully
      props.closeModal();
      // You can perform additional actions here, such as updating the UI or showing a success message
    } else {
      // Handle the case where the update was not successful
      // You can display an error message or take appropriate action
      console.error('Note update failed:', updateResult.message);
    }
  };

  return (
    <div className="container" style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
      <button
        type="button"
        className="btn btn-primary"
        data-bs-toggle="modal"
        data-bs-target="#exampleModal"
      >
        Edit Note
      </button>

      <div className="modal fade" id="exampleModal" tabIndex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="exampleModalLabel">Edit Note</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              {/* Input field for editing the note's content */}
              <textarea
                className="form-control"
                value={updatedContent}
                onChange={handleContentChange}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveChanges}>Save changes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Update;
