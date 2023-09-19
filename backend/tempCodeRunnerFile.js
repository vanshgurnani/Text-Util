// Create a new note
app.post('/api/notes', async (req, res) => {
  try {
    const { content, category } = req.body; // Include the category in the request
    const newNote = new Note({ content, category }); // Save the category along with the note
    await newNote.save();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});