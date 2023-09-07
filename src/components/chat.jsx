import React, { useState } from 'react';
import axios from 'axios';

const Chat = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Add user message to the chat
    setMessages([...messages, { text: input, user: 'user' }]);
    setInput('');

    // Send the user message to the server for a response
    try {
      const response = await axios.post('https://text-util-c6tr.vercel.app/get_summary', { text: input });
      const botResponse = response.data.summary;

      // Add bot response (summary) to the chat
      setMessages([...messages, { text: botResponse, user: 'bot' }]);
      setSummary(botResponse); // Update the summary state
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleClear = () => {
    // Clear the chat messages and summary
    setMessages([]);
    setSummary('');
  };

  return (
    <div className='d-flex justify-content-center'>
      <form method='post' onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
        <button type="button" onClick={handleClear}>
          Clear
        </button>
      </form>
      <div className="summary">
        <h3>Summary:</h3>
        <p>{summary}</p>
      </div>
      <div className="chat">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.user === 'user' ? 'user' : 'bot'}`}
          >
            {message.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Chat;
